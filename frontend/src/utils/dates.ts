/** Utilitários de data do calendário editorial (sempre no fuso local do navegador) */

export const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const DEFAULT_PUBLISH_HOUR = 18;

/** Chave estável de um dia no fuso local: "2026-11-04" */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDayKey(key: string): Date {
  const [y = 0, m = 1, d = 1] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

/**
 * Dias exibidos na grade do mês: semanas completas de domingo a sábado,
 * incluindo o fim do mês anterior e o começo do seguinte.
 */
export function monthGridDays(month: Date): Date[] {
  const first = startOfMonth(month);
  const gridStart = addDays(first, -first.getDay());
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const gridEnd = addDays(last, 6 - last.getDay());

  const days: Date[] = [];
  for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) days.push(day);
  return days;
}

/** Intervalo [início do primeiro dia, fim do último dia] em ISO, para a API */
export function rangeToIso(days: Date[]): { de: string; ate: string } {
  const first = days[0] ?? new Date();
  const last = days[days.length - 1] ?? first;
  const end = new Date(last);
  end.setHours(23, 59, 59, 999);
  return { de: new Date(first.getFullYear(), first.getMonth(), first.getDate()).toISOString(), ate: end.toISOString() };
}

/**
 * Data no dia escolhido mantendo o horário atual do conteúdo
 * (ou 18h, horário de pico comum, quando ele ainda não tem data).
 */
export function moveToDay(targetDay: Date, currentIso: string | null): string {
  const date = new Date(targetDay);
  if (currentIso) {
    const current = new Date(currentIso);
    date.setHours(current.getHours(), current.getMinutes(), 0, 0);
  } else {
    date.setHours(DEFAULT_PUBLISH_HOUR, 0, 0, 0);
  }
  return date.toISOString();
}

export function isSameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

export function formatMonthTitle(date: Date): string {
  const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function formatLongDay(date: Date): string {
  const label = date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const MONTH_SLATE = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

/** Data no estilo claquete: "QUA 12 NOV" */
export function slateDate(date: Date): string {
  const weekday = (WEEKDAY_LABELS[date.getDay()] ?? "").toUpperCase();
  return `${weekday} ${String(date.getDate()).padStart(2, "0")} ${MONTH_SLATE[date.getMonth()]}`;
}

/** Dia curto no estilo claquete: "QUI 14" */
export function slateDay(date: Date): string {
  const weekday = (WEEKDAY_LABELS[date.getDay()] ?? "").toUpperCase();
  return `${weekday} ${String(date.getDate()).padStart(2, "0")}`;
}

/** Hora no formato de timecode: "18:30" */
export function slateTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
