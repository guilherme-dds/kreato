/**
 * Tokens dos gráficos (tema escuro único do app).
 * Todos os gráficos são de série única: uma cor de marca, sem legenda (o título diz o que é plotado).
 * #7c5cff validado contra a superfície #161522: banda de luminosidade, croma e contraste >= 3:1.
 */
export const CHART = {
  series: "#7c5cff",
  seriesHover: "#9277ff",
  areaFill: "rgba(124, 92, 255, 0.1)",
  surface: "#161522",
  grid: "rgba(255, 255, 255, 0.06)",
  axisText: "#6e6a86",
  cursor: "rgba(255, 255, 255, 0.04)",
  barSize: 24,
  /** Cantos arredondados só na ponta do dado; a base fica reta */
  columnRadius: [4, 4, 0, 0] as [number, number, number, number],
  barRadius: [0, 4, 4, 0] as [number, number, number, number],
  axisTick: { fill: "#6e6a86", fontSize: 12 },
} as const;

/** Extrai o item de dados sob o cursor do payload que o Recharts passa ao Tooltip */
export function tooltipDatum<T>(active: boolean | undefined, payload: unknown): T | null {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null;
  const first = payload[0] as { payload?: T } | undefined;
  return first?.payload ?? null;
}
