/**
 * Tokens dos gráficos (tema estúdio: espelham --ink, --sheet, --line-soft e --ink-3 do index.css).
 * Todos os gráficos são de série única: nanquim, sem legenda (o título diz o que é plotado).
 * Nanquim #1b1a17 sobre a folha #fbfaf6: contraste ~16:1. O hover usa o REC (o ponto sob o cursor é "o agora").
 */
export const CHART = {
  series: "#1b1a17",
  seriesHover: "#e0412b",
  areaFill: "rgba(27, 26, 23, 0.06)",
  surface: "#fbfaf6",
  grid: "rgba(27, 26, 23, 0.07)",
  axisText: "#807c71",
  cursor: "rgba(27, 26, 23, 0.04)",
  barSize: 24,
  /** Cantos arredondados só na ponta do dado; a base fica reta */
  columnRadius: [4, 4, 0, 0] as [number, number, number, number],
  barRadius: [0, 4, 4, 0] as [number, number, number, number],
  axisTick: { fill: "#807c71", fontSize: 12, fontFamily: "IBM Plex Mono, monospace" },
} as const;

/** Extrai o item de dados sob o cursor do payload que o Recharts passa ao Tooltip */
export function tooltipDatum<T>(active: boolean | undefined, payload: unknown): T | null {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;
  const first = payload[0] as { payload?: T } | undefined;
  return first?.payload ?? null;
}
