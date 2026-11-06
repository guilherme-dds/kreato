import type { Request, Response } from "express";
import { Prisma } from "../generated/prisma/client.js";
import prisma from "../utils/prisma.js";
import { logEvent } from "../utils/logger.js";
import { getPlanLimits, normalizePlan, rejectPlanLimit } from "../utils/plans.js";
import { parsePositiveInt } from "../utils/request.js";
import { normalizeWorkspaceRole } from "../utils/workspaces.js";
import { escapeHtml, sendEmail } from "../utils/mailer.js";
import {
  MAX_INVITES_PER_DAY,
  canAssignRole,
  generateInviteToken,
  hasFreeSeat,
  hashInviteToken,
  inviteExpiry,
  inviteState,
  normalizeEmail,
  parseAssignableRole,
  type AssignableRole,
} from "../utils/team.js";
import { getFrontendUrl } from "./StripeController.js";

const ROLE_LABELS: Record<AssignableRole, string> = {
  GESTOR: "gestor(a)",
  ROTEIRISTA: "roteirista",
  EDITOR: "editor(a)",
};

const inviteSelect = {
  id: true,
  email: true,
  papel: true,
  status: true,
  expiraEm: true,
  criadoEm: true,
  convidadoPor: { select: { id: true, nome: true } },
} satisfies Prisma.ConviteSelect;

type InviteRecord = Prisma.ConviteGetPayload<{ select: typeof inviteSelect }>;

function serializeInvite(invite: InviteRecord) {
  return { ...invite, papel: normalizeWorkspaceRole(invite.papel), estado: inviteState(invite) };
}

function inviteLink(req: Request, token: string) {
  return `${getFrontendUrl(req)}/convite?token=${encodeURIComponent(token)}`;
}

async function sendInviteEmail(
  req: Request,
  params: { email: string; token: string; papel: AssignableRole; workspaceName: string }
) {
  const inviter = await prisma.usuario.findUnique({ where: { id: req.userId }, select: { nome: true } });
  const inviterName = inviter?.nome || "Alguém";
  const link = inviteLink(req, params.token);
  const role = ROLE_LABELS[params.papel];

  const result = await sendEmail({
    to: params.email,
    subject: `${inviterName} convidou você para o Kreato`,
    text: `${inviterName} convidou você para entrar no workspace "${params.workspaceName}" como ${role}. Aceite em: ${link} (válido por 7 dias).`,
    html: `<div style="font-family: sans-serif; padding: 20px; color: #1f1d2b;">
      <h2>Você foi convidado(a) para o Kreato</h2>
      <p><strong>${escapeHtml(inviterName)}</strong> convidou você para o workspace
      <strong>${escapeHtml(params.workspaceName)}</strong> como ${role}.</p>
      <p><a href="${escapeHtml(link)}" style="display: inline-block; padding: 10px 20px; background-color: #7c5cff; color: #fff; text-decoration: none; border-radius: 6px;">Aceitar convite</a></p>
      <p style="color: #6e6a86; font-size: 13px;">O convite vale por 7 dias. Use a conta com este e-mail para aceitar.</p>
    </div>`,
  });

  if (!result.enviado) console.warn(`[Convites] E-mail para ${params.email} não enviado: ${result.erro}`);
  return { link, emailEnviado: result.enviado };
}

/** Responde 429 se o workspace já criou/reenviou convites demais nas últimas 24h */
async function rejectIfRateLimited(req: Request, res: Response): Promise<boolean> {
  const recent = await prisma.convite.count({
    where: { workspaceId: req.workspaceId, criadoEm: { gt: new Date(Date.now() - 86_400_000) } },
  });
  if (recent < MAX_INVITES_PER_DAY) return false;
  res.status(429).json({ error: "Muitos convites enviados nas últimas 24 horas. Tente novamente mais tarde." });
  return true;
}

export class InviteController {
  /**
   * GET /convites — convites pendentes (inclusive expirados, para reenviar) do workspace atual
   */
  async index(req: Request, res: Response) {
    try {
      const invites = await prisma.convite.findMany({
        where: { workspaceId: req.workspaceId, status: "PENDENTE" },
        orderBy: { criadoEm: "desc" },
        select: inviteSelect,
      });
      return res.json({ convites: invites.map(serializeInvite) });
    } catch (error: any) {
      console.error("Erro ao listar convites:", error);
      return res.status(500).json({ error: "Erro ao listar convites." });
    }
  }

  /**
   * POST /convites — corpo { email, papel? } (DONO ou GESTOR).
   * Cada convite válido reserva uma vaga do plano do dono até ser aceito, revogado ou expirar.
   */
  async create(req: Request, res: Response) {
    try {
      const email = normalizeEmail(req.body?.email);
      if (!email) return res.status(400).json({ error: "Informe um e-mail válido." });

      const papel = req.body?.papel === undefined ? "EDITOR" : parseAssignableRole(req.body.papel);
      if (!papel) return res.status(400).json({ error: "Papel inválido. Use GESTOR, ROTEIRISTA ou EDITOR." });
      if (!canAssignRole(req.workspaceRole, papel)) {
        return res.status(403).json({ error: "Só o dono do workspace pode convidar gestores." });
      }

      const now = new Date();
      const [workspace, existingMember, pendingSameEmail, members, pendingInvites] = await Promise.all([
        prisma.workspace.findUniqueOrThrow({ where: { id: req.workspaceId }, select: { nome: true } }),
        prisma.membroWorkspace.findFirst({ where: { workspaceId: req.workspaceId, usuario: { email } }, select: { id: true } }),
        prisma.convite.findFirst({
          where: { workspaceId: req.workspaceId, email, status: "PENDENTE", expiraEm: { gt: now } },
          select: { id: true },
        }),
        prisma.membroWorkspace.count({ where: { workspaceId: req.workspaceId } }),
        prisma.convite.count({ where: { workspaceId: req.workspaceId, status: "PENDENTE", expiraEm: { gt: now } } }),
      ]);

      if (existingMember) return res.status(409).json({ error: "Essa pessoa já faz parte da equipe.", code: "ALREADY_MEMBER" });
      if (pendingSameEmail) {
        return res.status(409).json({
          error: "Já existe um convite pendente para este e-mail. Reenvie-o se precisar.",
          code: "INVITE_ALREADY_PENDING",
          conviteId: pendingSameEmail.id,
        });
      }

      const limit = getPlanLimits(req.workspacePlan).membros;
      if (!hasFreeSeat(members, pendingInvites, limit)) {
        return rejectPlanLimit(
          req,
          res,
          "membros",
          members + pendingInvites,
          limit <= 1
            ? "Convidar pessoas para a equipe é um recurso do plano Kreato Studio."
            : `Sua equipe já ocupa as ${limit} vagas do plano (contando convites pendentes).`
        );
      }

      if (await rejectIfRateLimited(req, res)) return;

      const token = generateInviteToken();
      const invite = await prisma.convite.create({
        data: {
          workspaceId: req.workspaceId,
          email,
          papel,
          tokenHash: hashInviteToken(token),
          expiraEm: inviteExpiry(now),
          convidadoPorId: req.userId,
        },
        select: inviteSelect,
      });

      const delivery = await sendInviteEmail(req, { email, token, papel, workspaceName: workspace.nome });

      await logEvent({
        userId: req.userId,
        acao: "MEMBER_INVITED",
        req,
        entidade: "convite",
        entidadeId: invite.id,
        detalhes: { workspaceId: req.workspaceId, papel, emailEnviado: delivery.emailEnviado },
      });

      // O link só é devolvido aqui (o banco guarda apenas o hash): quem convidou pode compartilhá-lo
      return res.status(201).json({ convite: serializeInvite(invite), ...delivery });
    } catch (error: any) {
      console.error("Erro ao criar convite:", error);
      return res.status(500).json({ error: "Erro ao criar convite." });
    }
  }

  /**
   * POST /convites/:id/reenviar — gera um novo link (o anterior deixa de valer) e renova a validade
   */
  async resend(req: Request, res: Response) {
    try {
      const id = parsePositiveInt(req.params.id);
      if (!id) return res.status(400).json({ error: "ID de convite inválido." });

      const invite = await prisma.convite.findFirst({
        where: { id, workspaceId: req.workspaceId, status: "PENDENTE" },
        select: { id: true, email: true, papel: true, expiraEm: true, workspace: { select: { nome: true } } },
      });
      if (!invite) return res.status(404).json({ error: "Convite pendente não encontrado." });

      const papel = parseAssignableRole(invite.papel) ?? "EDITOR";
      if (!canAssignRole(req.workspaceRole, papel)) {
        return res.status(403).json({ error: "Só o dono do workspace pode reenviar convites de gestores." });
      }

      // Convite expirado volta a ocupar uma vaga: confere se ainda cabe
      const now = new Date();
      if (invite.expiraEm <= now) {
        const [members, pendingInvites] = await Promise.all([
          prisma.membroWorkspace.count({ where: { workspaceId: req.workspaceId } }),
          prisma.convite.count({ where: { workspaceId: req.workspaceId, status: "PENDENTE", expiraEm: { gt: now } } }),
        ]);
        const limit = getPlanLimits(req.workspacePlan).membros;
        if (!hasFreeSeat(members, pendingInvites, limit)) {
          return rejectPlanLimit(req, res, "membros", members + pendingInvites, "Não há vagas livres no plano para reativar este convite.");
        }
      }

      if (await rejectIfRateLimited(req, res)) return;

      const token = generateInviteToken();
      const updated = await prisma.convite.update({
        where: { id: invite.id },
        // criadoEm renovado para contar no limite diário de envios
        data: { tokenHash: hashInviteToken(token), expiraEm: inviteExpiry(now), criadoEm: now },
        select: inviteSelect,
      });

      const delivery = await sendInviteEmail(req, { email: invite.email, token, papel, workspaceName: invite.workspace.nome });

      await logEvent({
        userId: req.userId,
        acao: "INVITE_RESENT",
        req,
        entidade: "convite",
        entidadeId: invite.id,
        detalhes: { emailEnviado: delivery.emailEnviado },
      });

      return res.json({ convite: serializeInvite(updated), ...delivery });
    } catch (error: any) {
      console.error("Erro ao reenviar convite:", error);
      return res.status(500).json({ error: "Erro ao reenviar convite." });
    }
  }

  /**
   * DELETE /convites/:id — revoga um convite pendente (o link deixa de funcionar)
   */
  async revoke(req: Request, res: Response) {
    try {
      const id = parsePositiveInt(req.params.id);
      if (!id) return res.status(400).json({ error: "ID de convite inválido." });

      const invite = await prisma.convite.findFirst({
        where: { id, workspaceId: req.workspaceId, status: "PENDENTE" },
        select: { id: true, papel: true },
      });
      if (!invite) return res.status(404).json({ error: "Convite pendente não encontrado." });

      const papel = parseAssignableRole(invite.papel) ?? "EDITOR";
      if (!canAssignRole(req.workspaceRole, papel)) {
        return res.status(403).json({ error: "Só o dono do workspace pode revogar convites de gestores." });
      }

      await prisma.convite.update({ where: { id: invite.id }, data: { status: "REVOGADO" } });

      await logEvent({ userId: req.userId, acao: "INVITE_REVOKED", req, entidade: "convite", entidadeId: invite.id });

      return res.status(204).send();
    } catch (error: any) {
      console.error("Erro ao revogar convite:", error);
      return res.status(500).json({ error: "Erro ao revogar convite." });
    }
  }

  /**
   * GET /convites/token/:token — público: dados do convite para a tela de aceite (antes do login)
   */
  async preview(req: Request, res: Response) {
    try {
      const token = typeof req.params.token === "string" ? req.params.token : "";
      if (token.length < 20 || token.length > 100) return res.status(404).json({ error: "Convite não encontrado." });

      const invite = await prisma.convite.findUnique({
        where: { tokenHash: hashInviteToken(token) },
        select: {
          email: true,
          papel: true,
          status: true,
          expiraEm: true,
          workspace: { select: { nome: true } },
          convidadoPor: { select: { nome: true } },
        },
      });
      if (!invite) return res.status(404).json({ error: "Convite não encontrado." });

      return res.json({
        convite: {
          email: invite.email,
          papel: normalizeWorkspaceRole(invite.papel),
          estado: inviteState(invite),
          expiraEm: invite.expiraEm,
          workspace: invite.workspace.nome,
          convidadoPor: invite.convidadoPor?.nome ?? null,
        },
      });
    } catch (error: any) {
      console.error("Erro ao consultar convite:", error);
      return res.status(500).json({ error: "Erro ao consultar convite." });
    }
  }

  /**
   * POST /convites/aceitar — corpo { token }. Exige estar logado com o mesmo e-mail do convite
   * (o token prova acesso à caixa de entrada; o e-mail impede repassar o link para outra conta).
   */
  async accept(req: Request, res: Response) {
    try {
      const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
      if (!token) return res.status(400).json({ error: "Token do convite não informado." });

      const [invite, user] = await Promise.all([
        prisma.convite.findUnique({
          where: { tokenHash: hashInviteToken(token) },
          select: {
            id: true,
            email: true,
            papel: true,
            status: true,
            expiraEm: true,
            workspaceId: true,
            workspace: { select: { nome: true, dono: { select: { plano: true } } } },
          },
        }),
        prisma.usuario.findUnique({ where: { id: req.userId }, select: { email: true } }),
      ]);

      if (!invite || !user) return res.status(404).json({ error: "Convite não encontrado." });

      const state = inviteState(invite);
      if (state !== "PENDENTE") {
        const messages = {
          EXPIRADO: "Este convite expirou. Peça um novo para quem convidou você.",
          ACEITO: "Este convite já foi usado.",
          REVOGADO: "Este convite foi cancelado.",
        } as const;
        return res.status(410).json({ error: messages[state], code: `INVITE_${state}` });
      }

      if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
        return res.status(403).json({
          error: `Este convite foi enviado para ${invite.email}. Entre com essa conta para aceitar.`,
          code: "INVITE_EMAIL_MISMATCH",
        });
      }

      const papel = parseAssignableRole(invite.papel) ?? "EDITOR";
      const workspaceSummary = { id: invite.workspaceId, nome: invite.workspace.nome };

      const alreadyMember = await prisma.membroWorkspace.findUnique({
        where: { workspaceId_usuarioId: { workspaceId: invite.workspaceId, usuarioId: req.userId } },
        select: { papel: true },
      });
      if (alreadyMember) {
        await prisma.convite.update({
          where: { id: invite.id },
          data: { status: "ACEITO", aceitoPorId: req.userId, aceitoEm: new Date() },
        });
        return res.json({ workspace: workspaceSummary, papel: normalizeWorkspaceRole(alreadyMember.papel) });
      }

      // O dono pode ter rebaixado o plano depois de convidar: o convite já reservava esta vaga
      const limit = getPlanLimits(normalizePlan(invite.workspace.dono.plano)).membros;
      const members = await prisma.membroWorkspace.count({ where: { workspaceId: invite.workspaceId } });
      if (members >= limit) {
        return res.status(403).json({
          error: "A equipe deste workspace está completa no plano atual. Avise quem convidou você.",
          code: "PLAN_LIMIT_REACHED",
          resource: "membros",
          limit,
        });
      }

      try {
        await prisma.$transaction([
          prisma.membroWorkspace.create({ data: { workspaceId: invite.workspaceId, usuarioId: req.userId, papel } }),
          // Condicional ao status: dois aceites simultâneos do mesmo link não criam duas entradas
          prisma.convite.update({
            where: { id: invite.id, status: "PENDENTE" },
            data: { status: "ACEITO", aceitoPorId: req.userId, aceitoEm: new Date() },
          }),
        ]);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2025")) {
          return res.status(409).json({ error: "Este convite acabou de ser usado. Atualize a página." });
        }
        throw error;
      }

      await logEvent({
        userId: req.userId,
        acao: "INVITE_ACCEPTED",
        req,
        entidade: "convite",
        entidadeId: invite.id,
        detalhes: { workspaceId: invite.workspaceId, papel },
      });

      return res.json({ workspace: workspaceSummary, papel });
    } catch (error: any) {
      console.error("Erro ao aceitar convite:", error);
      return res.status(500).json({ error: "Erro ao aceitar convite." });
    }
  }
}
