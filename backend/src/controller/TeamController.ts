import type { Request, Response } from "express";
import prisma from "../utils/prisma.js";
import { logEvent } from "../utils/logger.js";
import { getPlanLimits } from "../utils/plans.js";
import { parsePositiveInt } from "../utils/request.js";
import { canManageWorkspace, normalizeWorkspaceRole, WORKSPACE_ROLES } from "../utils/workspaces.js";
import { canAssignRole, canManageMember, parseAssignableRole } from "../utils/team.js";

const memberSelect = {
  id: true,
  papel: true,
  criadoEm: true,
  usuario: { select: { id: true, nome: true, email: true, fotoPerfil: true } },
} as const;

/** Membros do workspace atual: listar, mudar papel, remover e sair */
export class TeamController {
  /**
   * GET /membros — qualquer membro vê a equipe; inclui as vagas do plano do dono
   */
  async index(req: Request, res: Response) {
    try {
      const now = new Date();
      const [members, pendingInvites] = await Promise.all([
        prisma.membroWorkspace.findMany({ where: { workspaceId: req.workspaceId }, select: memberSelect }),
        prisma.convite.count({
          where: { workspaceId: req.workspaceId, status: "PENDENTE", expiraEm: { gt: now } },
        }),
      ]);

      // DONO primeiro, depois por papel e antiguidade
      const rank = (papel: string) => WORKSPACE_ROLES.indexOf(normalizeWorkspaceRole(papel));
      members.sort((a, b) => rank(a.papel) - rank(b.papel) || a.criadoEm.getTime() - b.criadoEm.getTime());

      const limit = getPlanLimits(req.workspacePlan).membros;
      return res.json({
        membros: members.map((member) => ({
          ...member,
          papel: normalizeWorkspaceRole(member.papel),
          souEu: member.usuario.id === req.userId,
        })),
        meuPapel: req.workspaceRole,
        podeGerenciar: canManageWorkspace(req.workspaceRole),
        vagas: {
          membros: members.length,
          convitesPendentes: pendingInvites,
          limite: Number.isFinite(limit) ? limit : null,
        },
      });
    } catch (error: any) {
      console.error("Erro ao listar membros:", error);
      return res.status(500).json({ error: "Erro ao listar membros." });
    }
  }

  /**
   * PATCH /membros/:id — corpo { papel } (DONO ou GESTOR; o GESTOR não promove nem rebaixa gestores)
   */
  async updateRole(req: Request, res: Response) {
    try {
      const id = parsePositiveInt(req.params.id);
      if (!id) return res.status(400).json({ error: "ID de membro inválido." });

      const papel = parseAssignableRole(req.body?.papel);
      if (!papel) return res.status(400).json({ error: "Papel inválido. Use GESTOR, ROTEIRISTA ou EDITOR." });

      const member = await prisma.membroWorkspace.findFirst({
        where: { id, workspaceId: req.workspaceId },
        select: { id: true, papel: true, usuarioId: true },
      });
      if (!member) return res.status(404).json({ error: "Membro não encontrado." });

      if (member.usuarioId === req.userId) {
        return res.status(400).json({ error: "Você não pode alterar o próprio papel." });
      }

      const currentRole = normalizeWorkspaceRole(member.papel);
      if (!canManageMember(req.workspaceRole, currentRole) || !canAssignRole(req.workspaceRole, papel)) {
        await logEvent({
          userId: req.userId,
          acao: "PERMISSION_DENIED",
          req,
          entidade: "membro",
          entidadeId: member.id,
          detalhes: { papelAtual: currentRole, papelPedido: papel, meuPapel: req.workspaceRole },
        });
        return res.status(403).json({ error: "Seu papel não permite essa alteração." });
      }

      if (currentRole === papel) {
        return res.json({ membro: await prisma.membroWorkspace.findUnique({ where: { id }, select: memberSelect }) });
      }

      const updated = await prisma.membroWorkspace.update({ where: { id }, data: { papel }, select: memberSelect });

      await logEvent({
        userId: req.userId,
        acao: "MEMBER_ROLE_CHANGED",
        req,
        entidade: "membro",
        entidadeId: member.id,
        detalhes: { workspaceId: req.workspaceId, usuarioId: member.usuarioId, de: currentRole, para: papel },
      });

      return res.json({ membro: updated });
    } catch (error: any) {
      console.error("Erro ao alterar papel:", error);
      return res.status(500).json({ error: "Erro ao alterar papel do membro." });
    }
  }

  /**
   * DELETE /membros/:id — remove alguém da equipe (para sair você mesmo, use POST /membros/sair)
   */
  async remove(req: Request, res: Response) {
    try {
      const id = parsePositiveInt(req.params.id);
      if (!id) return res.status(400).json({ error: "ID de membro inválido." });

      const member = await prisma.membroWorkspace.findFirst({
        where: { id, workspaceId: req.workspaceId },
        select: { id: true, papel: true, usuarioId: true },
      });
      if (!member) return res.status(404).json({ error: "Membro não encontrado." });

      if (member.usuarioId === req.userId) {
        return res.status(400).json({ error: "Para sair do workspace, use a opção Sair." });
      }

      const role = normalizeWorkspaceRole(member.papel);
      if (!canManageMember(req.workspaceRole, role)) {
        await logEvent({
          userId: req.userId,
          acao: "PERMISSION_DENIED",
          req,
          entidade: "membro",
          entidadeId: member.id,
          detalhes: { papelAlvo: role, meuPapel: req.workspaceRole },
        });
        return res.status(403).json({ error: "Seu papel não permite remover este membro." });
      }

      await prisma.membroWorkspace.delete({ where: { id } });

      await logEvent({
        userId: req.userId,
        acao: "MEMBER_REMOVED",
        req,
        entidade: "membro",
        entidadeId: member.id,
        detalhes: { workspaceId: req.workspaceId, usuarioId: member.usuarioId, papel: role },
      });

      return res.status(204).send();
    } catch (error: any) {
      console.error("Erro ao remover membro:", error);
      return res.status(500).json({ error: "Erro ao remover membro." });
    }
  }

  /**
   * POST /membros/sair — sai do workspace atual (o DONO não pode sair do próprio workspace)
   */
  async leave(req: Request, res: Response) {
    try {
      if (req.workspaceRole === "DONO") {
        return res.status(400).json({ error: "O dono não pode sair do próprio workspace." });
      }

      await prisma.membroWorkspace.deleteMany({ where: { workspaceId: req.workspaceId, usuarioId: req.userId } });

      await logEvent({
        userId: req.userId,
        acao: "MEMBER_LEFT",
        req,
        entidade: "workspace",
        entidadeId: req.workspaceId,
        detalhes: { papel: req.workspaceRole },
      });

      return res.status(204).send();
    } catch (error: any) {
      console.error("Erro ao sair do workspace:", error);
      return res.status(500).json({ error: "Erro ao sair do workspace." });
    }
  }
}
