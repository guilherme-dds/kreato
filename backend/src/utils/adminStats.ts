import { PAID_PLANS, PLAN_PRICING } from "./billing.js";
import { PLANS, normalizePlan, type Plan } from "./plans.js";

/**
 * Helpers do painel administrativo (funções puras).
 * Dias agrupados em UTC (YYYY-MM-DD), igual ao log-service, para os gráficos baterem.
 */

export const MIN_PERIOD_DAYS = 1;
export const MAX_PERIOD_DAYS = 90;
export const DEFAULT_PERIOD_DAYS = 30;

export function parsePeriodDays(value: unknown): number {
  const days = typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(days)) return DEFAULT_PERIOD_DAYS;
  return Math.min(MAX_PERIOD_DAYS, Math.max(MIN_PERIOD_DAYS, days));
}

/** 00:00 UTC do primeiro dia de um período de `days` dias que termina hoje */
export function periodStart(days: number, now = new Date()): Date {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

/** Conta datas por dia do período, incluindo os dias zerados */
export function bucketByDay(dates: Date[], days: number, now = new Date()): { dia: string; total: number }[] {
  const start = periodStart(days, now);
  const counts = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + i);
    counts.set(day.toISOString().slice(0, 10), 0);
  }
  for (const date of dates) {
    if (date < start || date > now) continue;
    const key = date.toISOString().slice(0, 10);
    const current = counts.get(key);
    if (current !== undefined) counts.set(key, current + 1);
  }
  return [...counts.entries()].map(([dia, total]) => ({ dia, total }));
}

/** Soma contagens por plano, normalizando valores antigos/inválidos (ex.: "premium" → FREE) */
export function countByPlan(rows: { plano: string; count: number }[]): Record<Plan, number> {
  const result = Object.fromEntries(PLANS.map((plan) => [plan, 0])) as Record<Plan, number>;
  for (const row of rows) result[normalizePlan(row.plano)] += row.count;
  return result;
}

