import type { Request, Response, NextFunction } from "express";
import prisma from "./prisma.js";
import { logEvent } from "./logger.js";

export const PLANS = ["FREE", "CREATOR", "STUDIO"] as const;
export type Plan = (typeof PLANS)[number];

export interface PlanLimits {
  ideias: number;
  conteudosAtivos: number;
  armazenamentoMB: number;
  historicoMetricasDias: number;
  membros: number;
}

const UNLIMITED = Number.POSITIVE_INFINITY;

// Limites iniciais (a validar com potenciais clientes, conforme o Lean Canvas)
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    ideias: 50,
    conteudosAtivos: 15,
    armazenamentoMB: 100,
    historicoMetricasDias: 30,
    membros: 1,
  },
  CREATOR: {
    ideias: UNLIMITED,
    conteudosAtivos: UNLIMITED,
    armazenamentoMB: 2 * 1024,
    historicoMetricasDias: UNLIMITED,
    membros: 1,
  },
  STUDIO: {
    ideias: UNLIMITED,
    conteudosAtivos: UNLIMITED,
    armazenamentoMB: 10 * 1024,
    historicoMetricasDias: UNLIMITED,
    membros: 5,
  },
};

export function normalizePlan(value: unknown): Plan {
  const upper = typeof value === "string" ? value.toUpperCase() : "";
  return (PLANS as readonly string[]).includes(upper) ? (upper as Plan) : "FREE";
}

export function isPaidPlan(plan: unknown): boolean {
  return normalizePlan(plan) !== "FREE";
}

export function hasPlanAtLeast(plan: unknown, minimum: Plan): boolean {
  return PLANS.indexOf(normalizePlan(plan)) >= PLANS.indexOf(minimum);
}

export function getPlanLimits(plan: unknown): PlanLimits {
  return PLAN_LIMITS[normalizePlan(plan)];
}

/** Limites em formato serializável: recursos ilimitados viram null no JSON */
export function serializePlanLimits(plan: unknown): Record<keyof PlanLimits, number | null> {
  const limits = getPlanLimits(plan);
  return Object.fromEntries(
    Object.entries(limits).map(([resource, value]) => [resource, Number.isFinite(value) ? value : null]),
  ) as Record<keyof PlanLimits, number | null>;
}

export function isWithinLimit(plan: unknown, resource: keyof PlanLimits, currentUsage: number): boolean {
  return currentUsage < getPlanLimits(plan)[resource];
}

/**
 * Registra o evento PLAN_LIMIT_REACHED e responde 403 com o código que o frontend usa
 * para oferecer upgrade. O limite é sempre o do plano do dono do workspace.
 */
export async function rejectPlanLimit(
  req: Request,
  res: Response,
  resource: keyof PlanLimits,
  usage: number,
  message: string,
) {
  const limit = getPlanLimits(req.workspacePlan)[resource];
  await logEvent({
    userId: req.userId,
    acao: "PLAN_LIMIT_REACHED",
    req,
    detalhes: { recurso: resource, uso: usage, limite: limit, plano: req.workspacePlan },
  });
  return res.status(403).json({ error: message, code: "PLAN_LIMIT_REACHED", resource, limit });
}

/**
 * Restringe a rota a usuários com o plano mínimo informado.
 * O plano é lido do banco a cada requisição para refletir upgrades/cancelamentos imediatamente.
 */
export function requirePlan(minimum: Plan) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await prisma.usuario.findUnique({
      where: { id: req.userId },
      select: { plano: true },
    });

    if (!user || !hasPlanAtLeast(user.plano, minimum)) {
      await logEvent({
        userId: req.userId,
        acao: "PLAN_REQUIRED",
        req,
        detalhes: { planoAtual: user?.plano ?? null, planoMinimo: minimum, rota: req.originalUrl },
      });
      return res.status(403).json({
        error: `Recurso disponível a partir do plano ${minimum}.`,
        code: "PLAN_REQUIRED",
        requiredPlan: minimum,
      });
    }

    return next();
  };
}
