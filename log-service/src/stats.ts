/**
 * Agregação dos eventos de auditoria para o painel administrativo (funções puras).
 * Os dias são agrupados em UTC (YYYY-MM-DD), igual ao timestamp gravado pelos serviços.
 */

export interface StatsEntry {
  user_id: string;
  acao: string;
  timestamp: string;
  ip: string;
  entidade?: string;
  entidade_id?: string;
}

export const MIN_DAYS = 1;
export const MAX_DAYS = 90;
export const DEFAULT_DAYS = 30;
const TOP_ACTIONS = 12;
const RECENT_SECURITY = 10;

/** Eventos que indicam acesso negado, falha ou tentativa suspeita */
export const SECURITY_ACTIONS = ["PERMISSION_DENIED", "ERROR", "VERIFY_STRIPE_SESSION_REJECTED"] as const;

export function parseDays(value: unknown): number {
  const days = typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(days)) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, days));
}

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

/** Início (UTC, 00:00) do primeiro dia do período que termina hoje */
export function periodStart(days: number, now = new Date()): Date {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

const isAnonymous = (userId: string) => !userId || userId === "anonymous";

const RECENT_EVENTS = 15;

const toRecent = (e: StatsEntry) => ({
  acao: e.acao,
  timestamp: e.timestamp,
  user_id: isAnonymous(e.user_id) ? null : e.user_id,
  ip: e.ip,
  entidade: e.entidade ?? null,
  entidade_id: e.entidade_id ?? null,
});

export function buildStats(entries: StatsEntry[], days: number, now = new Date()) {
  const start = periodStart(days, now);

  // Um bucket por dia, inclusive os sem eventos (o gráfico não pula dias)
  const buckets = new Map<string, { eventos: number; usuarios: Set<string>; logins: number; negados: number }>();
  for (let i = 0; i < days; i++) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + i);
    buckets.set(dayKey(day), { eventos: 0, usuarios: new Set(), logins: 0, negados: 0 });
  }

  const byAction = new Map<string, number>();
  const activeUsers = new Set<string>();
  const security: StatsEntry[] = [];
  let total = 0;
  let denied = 0;
  let errors = 0;
  let limits = 0;

  for (const entry of entries) {
    const time = new Date(entry.timestamp);
    if (Number.isNaN(time.getTime()) || time < start || time > now) continue;
    const bucket = buckets.get(dayKey(time));
    if (!bucket) continue;

    total++;
    bucket.eventos++;
    byAction.set(entry.acao, (byAction.get(entry.acao) ?? 0) + 1);

    if (!isAnonymous(entry.user_id)) {
      bucket.usuarios.add(entry.user_id);
      activeUsers.add(entry.user_id);
    }
    if (entry.acao === "LOGIN") bucket.logins++;
    if (entry.acao === "PERMISSION_DENIED") {
      bucket.negados++;
      denied++;
    }
    if (entry.acao === "ERROR") errors++;
    if (entry.acao === "PLAN_LIMIT_REACHED") limits++;
    if ((SECURITY_ACTIONS as readonly string[]).includes(entry.acao)) security.push(entry);
  }

  security.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return {
    periodo: { dias: days, inicio: start.toISOString(), fim: now.toISOString() },
    total,
    usuariosAtivos: activeUsers.size,
    porDia: [...buckets.entries()].map(([dia, b]) => ({
      dia,
      eventos: b.eventos,
      usuariosAtivos: b.usuarios.size,
      logins: b.logins,
      negados: b.negados,
    })),
    porAcao: [...byAction.entries()]
      .map(([acao, count]) => ({ acao, total: count }))
      .sort((a, b) => b.total - a.total || a.acao.localeCompare(b.acao))
      .slice(0, TOP_ACTIONS),
    // Últimos eventos de qualquer tipo (inclui os webhooks do Stripe)
    recentes: entries
      .filter((e) => {
        const time = new Date(e.timestamp);
        return !Number.isNaN(time.getTime()) && time >= start && time <= now;
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, RECENT_EVENTS)
      .map(toRecent),
    seguranca: {
      acessosNegados: denied,
      erros: errors,
      limitesAtingidos: limits,
      recentes: security.slice(0, RECENT_SECURITY).map(toRecent),
    },
  };
}

export type LogStats = ReturnType<typeof buildStats>;
