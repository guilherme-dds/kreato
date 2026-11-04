export const PLATFORMS = ["TIKTOK", "INSTAGRAM", "YOUTUBE", "OUTRA"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const IDEA_STATUSES = ["NOVA", "EM_DESENVOLVIMENTO", "ARQUIVADA"] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

export function parseEnum<T extends string>(values: readonly T[], value: unknown): T | null {
  const upper = typeof value === "string" ? value.trim().toUpperCase() : "";
  return (values as readonly string[]).includes(upper) ? (upper as T) : null;
}

/**
 * Normaliza tags vindas do cliente: aceita array ou string separada por vírgulas,
 * remove "#", espaços extras e duplicatas, e limita quantidade e tamanho.
 */
export function normalizeTags(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const tags = new Set<string>();

  for (const item of raw) {
    if (typeof item !== "string") continue;
    const tag = item.trim().replace(/^#+/, "").replace(/\s+/g, " ").toLowerCase().slice(0, MAX_TAG_LENGTH);
    if (tag) tags.add(tag);
    if (tags.size >= MAX_TAGS) break;
  }

  return [...tags];
}

/** Lê as tags salvas no banco (coluna Json) de forma segura */
export function readTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string") : [];
}

/**
 * Normaliza um campo de texto opcional: string vazia vira null.
 * Retorna undefined quando o campo não foi enviado (útil em atualizações parciais).
 */
export function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}
