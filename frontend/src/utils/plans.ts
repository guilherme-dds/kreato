import type { Plan, User } from "../types";

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
