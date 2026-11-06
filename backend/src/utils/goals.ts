/** Meta semanal de publicações e sequência de semanas cumpridas (funções puras, sem acesso ao banco) */

export const WEEK_MS = 7 * 86_400_000;
export const MIN_WEEKLY_GOAL = 1;
export const MAX_WEEKLY_GOAL = 21;
/** Quantas semanas para trás são consideradas no cálculo da sequência */
export const STREAK_LOOKBACK_WEEKS = 52;
/** Semanas exibidas no histórico do dashboard (da mais antiga para a atual) */
export const HISTORY_WEEKS = 8;

/** Valida a meta semanal: inteiro entre 1 e 21 publicações (null se inválida) */
export function parseWeeklyGoal(value: unknown): number | null {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isInteger(number)) return null;
  return number >= MIN_WEEKLY_GOAL && number <= MAX_WEEKLY_GOAL ? number : null;
}

/** Segunda-feira 00:00 UTC da semana de `now` (usado quando o cliente não informa o fuso) */
export function utcWeekStart(now: Date): Date {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}

/**
 * O cliente envia o início da semana no fuso dele (segunda 00:00 local, em ISO).
 * Aceita apenas valores coerentes com "agora" (até 7 dias antes); caso contrário usa a semana UTC.
 */
export function resolveWeekStart(raw: string | null, now: Date): Date {
  if (raw) {
    const parsed = new Date(raw);
    const diff = now.getTime() - parsed.getTime();
    // Tolerância de 1 dia para fusos à frente de UTC
    if (!Number.isNaN(parsed.getTime()) && diff > -86_400_000 && diff <= WEEK_MS) return parsed;
  }
  return utcWeekStart(now);
}

export interface WeekProgress {
  inicio: Date;
  publicados: number;
  atingiu: boolean;
}

export interface WeeklyGoalProgress {
  meta: number;
  inicioSemana: Date;
  fimSemana: Date;
  publicadosSemana: number;
  semanaAtualConcluida: boolean;
  /** Semanas consecutivas com a meta cumprida; a semana atual só conta depois de cumprida */
  sequencia: number;
  semanas: WeekProgress[];
}

/**
 * Agrupa as datas de publicação por semana (índice 0 = semana atual, 1 = anterior...)
 * e calcula a sequência de semanas em que a meta foi atingida.
 */
export function weeklyGoalProgress(publishedAt: Date[], weekStart: Date, goal: number): WeeklyGoalProgress {
  const counts = new Array<number>(STREAK_LOOKBACK_WEEKS).fill(0);
  const startMs = weekStart.getTime();

  for (const date of publishedAt) {
    const diff = startMs - date.getTime();
    // diff <= 0: semana atual (ou futura, ignorada); diff > 0: semanas anteriores
    const index = diff <= 0 ? (-diff < WEEK_MS ? 0 : -1) : Math.ceil(diff / WEEK_MS);
    if (index >= 0 && index < STREAK_LOOKBACK_WEEKS) counts[index] = (counts[index] ?? 0) + 1;
  }

  const reached = (index: number) => (counts[index] ?? 0) >= goal;
  const currentDone = reached(0);

  let sequencia = 0;
  // Semana em andamento ainda não quebra a sequência: começa da anterior se não foi cumprida
  for (let index = currentDone ? 0 : 1; index < STREAK_LOOKBACK_WEEKS && reached(index); index++) {
    sequencia++;
  }

  const semanas: WeekProgress[] = [];
  for (let index = HISTORY_WEEKS - 1; index >= 0; index--) {
    semanas.push({
      inicio: new Date(startMs - index * WEEK_MS),
      publicados: counts[index] ?? 0,
      atingiu: reached(index),
    });
  }

  return {
    meta: goal,
    inicioSemana: weekStart,
    fimSemana: new Date(startMs + WEEK_MS),
    publicadosSemana: counts[0] ?? 0,
    semanaAtualConcluida: currentDone,
    sequencia,
    semanas,
  };
}
