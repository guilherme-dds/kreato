const fullNumber = new Intl.NumberFormat("pt-BR");
const compactNumber = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

/** 12.345 */
export function formatNumber(value: number): string {
  return fullNumber.format(value);
}

/** Números grandes compactos (12,3 mil · 1,2 mi); abaixo de 10 mil, completos */
export function formatCompact(value: number): string {
  return Math.abs(value) < 10_000 ? fullNumber.format(value) : compactNumber.format(value);
}

/** 4,25% (ou "—" quando não há base para calcular) */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}
