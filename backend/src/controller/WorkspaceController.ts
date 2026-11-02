import type { Request, Response } from "express";
import prisma from "../utils/prisma.js";
import { logEvent } from "../utils/logger.js";
import { normalizePlan, serializePlanLimits } from "../utils/plans.js";
import { canManageWorkspace, ensurePersonalWorkspace, normalizeWorkspaceRole } from "../utils/workspaces.js";

export class WorkspaceController {
  /**
   * Lista os workspaces dos quais o usuário participa (o pessoal é criado se ainda não existir)
   */
  async index(req: Request, res: Response) {
    try {
      const userId = req.userId;
      await ensurePersonalWorkspace(userId);

      const memberships = await prisma.membroWorkspace.findMany({
        where: { usuarioId: userId },
        orderBy: { criadoEm: "asc" },
        include: {
          workspace: {
            select: {
              id: true,
              nome: true,
              donoId: true,
              pessoalDoUsuarioId: true,
              dono: { select: { plano: true } },
              _count: { select: { membros: true } },
            },
          },
        },
      });

      const workspaces = memberships.map(({ papel, workspace }) => ({
        id: workspace.id,
        nome: workspace.nome,
        pessoal: workspace.pessoalDoUsuarioId === userId,
        papel: normalizeWorkspaceRole(papel),
        plano: normalizePlan(workspace.dono.plano),
        totalMembros: workspace._count.membros,
      }));

      return res.json({ workspaces });
    } catch (error: any) {
      console.error("Erro ao listar workspaces:", error);
      return res.status(500).json({ error: "Erro ao listar workspaces." });
    }
  }

  /**
   * Retorna o workspace atual (resolvido pelo WorkspaceMiddleware) com papel, plano e limites
   */
  async current(req: Request, res: Response) {
    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: req.workspaceId },
        select: {
          id: true,
          nome: true,
          donoId: true,
          pessoalDoUsuarioId: true,
          criadoEm: true,
          _count: { select: { membros: true } },
        },
      });

      if (!workspace) {
        return res.status(404).json({ error: "Workspace não encontrado." });
      }

      return res.json({
        workspace: {
          id: workspace.id,
          nome: workspace.nome,
          donoId: workspace.donoId,
          pessoal: workspace.pessoalDoUsuarioId === req.userId,
          criadoEm: workspace.criadoEm,
          totalMembros: workspace._count.membros,
          papel: req.workspaceRole,
          podeGerenciar: canManageWorkspace(req.workspaceRole),
          plano: req.workspacePlan,
          limites: serializePlanLimits(req.workspacePlan),
        },
      });
    } catch (error: any) {
      console.error("Erro ao buscar workspace atual:", error);
      return res.status(500).json({ error: "Erro ao buscar workspace." });
    }
  }

  /**
   * Renomeia o workspace atual (apenas DONO ou GESTOR)
   */
  async updateCurrent(req: Request, res: Response) {
    try {
      const { nome } = req.body || {};
      const trimmedName = typeof nome === "string" ? nome.trim() : "";

      if (trimmedName.length === 0 || trimmedName.length > 100) {
        return res.status(400).json({ error: "O nome do workspace deve ter entre 1 e 100 caracteres." });
      }

      const workspace = await prisma.workspace.update({
        where: { id: req.workspaceId },
        data: { nome: trimmedName },
        select: { id: true, nome: true },
      });

      await logEvent({
        userId: req.userId,
        acao: "WORKSPACE_UPDATED",
        req,
        entidade: "workspace",
        entidadeId: workspace.id,
        detalhes: { nome: workspace.nome },
      });

      return res.json({ workspace, message: "Workspace atualizado com sucesso." });
    } catch (error: any) {
      console.error("Erro ao atualizar workspace:", error);
      return res.status(500).json({ error: "Erro ao atualizar workspace." });
    }
  }
}
