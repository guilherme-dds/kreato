import type { Plan, PlanLimits, User } from "../types";

export const PLANS: Plan[] = ["FREE", "CREATOR", "STUDIO"];

export const PLAN_LABELS: Record<Plan, string> = {
  FREE: "Gratuito",
  CREATOR: "Kreato Creator",
  STUDIO: "Kreato Studio",
};

export function getUserPlan(user?: Pick<User, "plano"> | null): Plan {
  const plan = user?.plano?.toUpperCase();
  return PLANS.includes(plan as Plan) ? (plan as Plan) : "FREE";
}

export function isPaidPlan(user?: Pick<User, "plano"> | null): boolean {
  return getUserPlan(user) !== "FREE";
}

export function hasPlanAtLeast(user: Pick<User, "plano"> | null | undefined, minimum: Plan): boolean {
  return PLANS.indexOf(getUserPlan(user)) >= PLANS.indexOf(minimum);
}

/** Lista de benefícios gerada a partir dos limites reais do plano (mesma fonte do backend) */
export function planFeatures(limits: PlanLimits): string[] {
  const storage = limits.armazenamentoMB;
  return [
    limits.ideias === null ? "Ideias ilimitadas" : `Até ${limits.ideias} ideias`,
    limits.conteudosAtivos === null
      ? "Conteúdos ilimitados no pipeline"
      : `Até ${limits.conteudosAtivos} conteúdos em produção`,
    storage === null
      ? "Armazenamento ilimitado"
      : storage >= 1024
        ? `${storage / 1024} GB para anexos`
        : `${storage} MB para anexos`,
    limits.historicoMetricasDias === null
      ? "Histórico completo de métricas"
      : `Métricas dos últimos ${limits.historicoMetricasDias} dias`,
    limits.membros !== null && limits.membros > 1 ? `Equipe com até ${limits.membros} membros` : "Uso individual",
  ];
}
