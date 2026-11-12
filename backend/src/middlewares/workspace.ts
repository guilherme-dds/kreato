import type { Request, Response, NextFunction } from "express";
import { logEvent } from "../utils/logger.js";
import { getPlanLimits, normalizePlan } from "../utils/plans.js";
import {
  ensurePersonalWorkspace,
  findMembership,
  holdsSeat,
  normalizeWorkspaceRole,
  type WorkspaceRole,
} from "../utils/workspaces.js";

/**
 * Resolve o workspace da requisição (deve rodar depois do AuthMiddleware).
 * Usa o header X-Workspace-Id quando enviado; caso contrário, o workspace pessoal do usuário.
 * Preenche req.workspaceId, req.workspaceRole e req.workspacePlan (plano do dono do workspace).
 */
export async function WorkspaceMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers["x-workspace-id"];
  const requestedId = typeof header === "string" && header.trim().length > 0 ? header.trim() : null;

  try {
    const membership = requestedId
      ? await findMembership(requestedId, req.userId)
      : await ensurePersonalWorkspace(req.userId);

    if (!membership) {
      await logEvent({
        userId: req.userId,
        acao: "PERMISSION_DENIED",
        req,
        entidade: "workspace",
        entidadeId: requestedId,
      });
      // O código permite ao frontend descartar a seleção salva e voltar ao workspace pessoal
      return res.status(403).json({ error: "Você não tem acesso a este workspace.", code: "WORKSPACE_FORBIDDEN" });
    }

    const plan = normalizePlan(membership.workspace.dono.plano);

    // Plano do dono encolheu e a pessoa ficou fora das vagas: sem acesso até o dono resolver
    if (!(await holdsSeat(membership, getPlanLimits(plan).membros))) {
      await logEvent({
        userId: req.userId,
        acao: "PERMISSION_DENIED",
        req,
        entidade: "workspace",
        entidadeId: membership.workspaceId,
        detalhes: { motivo: "SEM_VAGA_NO_PLANO", plano: plan },
      });
      return res.status(403).json({
        error: "O plano deste workspace não tem mais vaga para você. Fale com o dono do workspace.",
        code: "WORKSPACE_SEAT_UNAVAILABLE",
      });
    }

    req.workspaceId = membership.workspaceId;
    req.workspaceRole = normalizeWorkspaceRole(membership.papel);
    req.workspacePlan = plan;

    return next();
  } catch (error) {
    console.error("Erro ao resolver workspace:", error);
    return res.status(500).json({ error: "Erro ao carregar o workspace." });
  }
}

/**
 * Restringe a rota aos papéis informados no workspace atual (deve rodar depois do WorkspaceMiddleware).
 */
export function requireWorkspaceRole(...roles: WorkspaceRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.workspaceRole || !roles.includes(req.workspaceRole)) {
      await logEvent({
        userId: req.userId,
        acao: "PERMISSION_DENIED",
        req,
        entidade: "workspace",
        entidadeId: req.workspaceId,
        detalhes: { papelAtual: req.workspaceRole ?? null, papeisPermitidos: roles },
      });
      return res.status(403).json({ error: "Seu papel neste workspace não permite esta ação." });
    }

    return next();
  };
}
