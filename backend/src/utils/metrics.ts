/** Cálculos de métricas de conteúdo (funções puras, sem acesso ao banco) */

export const METRIC_FIELDS = ["visualizacoes", "curtidas", "comentarios", "compartilhamentos", "salvamentos"] as const;
export const OPTIONAL_METRIC_FIELDS = ["alcance", "seguidoresGanhos"] as const;

export type MetricField = (typeof METRIC_FIELDS)[number];
export type OptionalMetricField = (typeof OPTIONAL_METRIC_FIELDS)[number];

export type MetricValues = Record<MetricField, number> & Record<OptionalMetricField, number | null>;

const MAX_METRIC_VALUE = 2_000_000_000; // cabe em INT do MySQL

/** Interações usadas na taxa de engajamento */
export function interactions(m: Pick<MetricValues, "curtidas" | "comentarios" | "compartilhamentos" | "salvamentos">) {
  return m.curtidas + m.comentarios + m.compartilhamentos + m.salvamentos;
}

/** Taxa de engajamento em % (interações / visualizações), com 2 casas; null sem visualizações */
export function engagementRate(m: MetricValues | null | undefined): number | null {
  if (!m || m.visualizacoes <= 0) return null;
  return Math.round((interactions(m) / m.visualizacoes) * 10_000) / 100;
}

/**
 * Valida os números enviados pelo cliente: inteiros entre 0 e 2 bilhões.
 * Os campos principais assumem 0 quando ausentes; os opcionais, null.
 */
export function parseMetricValues(body: unknown): { data: MetricValues } | { error: string } {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const data = {} as MetricValues;

  const parse = (field: string, value: unknown): number | null | "invalid" => {
    if (value === undefined || value === null || value === "") return null;
    const number = typeof value === "string" ? Number(value) : value;
    if (typeof number !== "number" || !Number.isInteger(number) || number < 0 || number > MAX_METRIC_VALUE) {
      return "invalid";
    }
    return number;
  };

  for (const field of METRIC_FIELDS) {
    const value = parse(field, input[field]);
    if (value === "invalid") return { error: `"${field}" deve ser um número inteiro entre 0 e 2 bilhões.` };
    data[field] = value ?? 0;
  }
  for (const field of OPTIONAL_METRIC_FIELDS) {
    const value = parse(field, input[field]);
    if (value === "invalid") return { error: `"${field}" deve ser um número inteiro entre 0 e 2 bilhões.` };
    data[field] = value;
  }

  if (METRIC_FIELDS.every((field) => data[field] === 0)) {
    return { error: "Informe ao menos um número (visualizações, curtidas, comentários...)." };
  }
  return { data };
}

export interface SummaryItem {
  plataforma: string | null;
  formato: string | null;
  metrica: MetricValues | null;
}

export interface SummaryTotals {
  conteudosPublicados: number;
  conteudosComMetricas: number;
  visualizacoes: number;
  curtidas: number;
  comentarios: number;
  compartilhamentos: number;
  salvamentos: number;
  seguidoresGanhos: number;
  /** Engajamento agregado: soma das interações / soma das visualizações */
  taxaEngajamento: number | null;
}

function emptyTotals(): SummaryTotals {
  return {
    conteudosPublicados: 0,
    conteudosComMetricas: 0,
    visualizacoes: 0,
    curtidas: 0,
    comentarios: 0,
    compartilhamentos: 0,
    salvamentos: 0,
    seguidoresGanhos: 0,
    taxaEngajamento: null,
  };
}

function accumulate(totals: SummaryTotals, item: SummaryItem) {
  totals.conteudosPublicados++;
  if (!item.metrica) return;
  totals.conteudosComMetricas++;
  for (const field of METRIC_FIELDS) totals[field] += item.metrica[field];
  totals.seguidoresGanhos += item.metrica.seguidoresGanhos ?? 0;
}

function finalize(totals: SummaryTotals): SummaryTotals {
  totals.taxaEngajamento =
    totals.visualizacoes > 0 ? Math.round((interactions(totals) / totals.visualizacoes) * 10_000) / 100 : null;
  return totals;
}

/** Totais gerais e agrupados por plataforma e formato, usando a métrica mais recente de cada conteúdo */
export function summarize(items: SummaryItem[]) {
  const total = emptyTotals();
  const byPlatform = new Map<string, SummaryTotals>();
  const byFormat = new Map<string, SummaryTotals>();

  for (const item of items) {
    accumulate(total, item);

    const platformKey = item.plataforma ?? "SEM_PLATAFORMA";
    if (!byPlatform.has(platformKey)) byPlatform.set(platformKey, emptyTotals());
    accumulate(byPlatform.get(platformKey) as SummaryTotals, item);

    const formatKey = item.formato ?? "SEM_FORMATO";
    if (!byFormat.has(formatKey)) byFormat.set(formatKey, emptyTotals());
    accumulate(byFormat.get(formatKey) as SummaryTotals, item);
  }

  const toList = <K extends string>(map: Map<string, SummaryTotals>, key: K) =>
    [...map.entries()]
      .map(([value, totals]) => ({ [key]: value, ...finalize(totals) }) as { [P in K]: string } & SummaryTotals)
      .sort((a, b) => b.visualizacoes - a.visualizacoes);

  return {
    totais: finalize(total),
    porPlataforma: toList(byPlatform, "plataforma"),
    porFormato: toList(byFormat, "formato"),
  };
}
