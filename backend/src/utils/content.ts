export const PLATFORMS = ["TIKTOK", "INSTAGRAM", "YOUTUBE", "OUTRA"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const IDEA_STATUSES = ["NOVA", "EM_DESENVOLVIMENTO", "ARQUIVADA"] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

/** Etapas do pipeline de produção, na ordem do kanban */
export const CONTENT_STAGES = ["IDEIA", "ROTEIRO", "GRAVACAO", "EDICAO", "AGENDADO", "PUBLICADO"] as const;
export type ContentStage = (typeof CONTENT_STAGES)[number];

/** Conteúdos publicados saem do pipeline ativo e não contam no limite do plano */
export const FINAL_STAGE: ContentStage = "PUBLICADO";

export const CONTENT_FORMATS = ["VIDEO_CURTO", "VIDEO_LONGO", "CARROSSEL", "IMAGEM", "STORY", "LIVE"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const MAX_TAGS = 10;
export const MAX_HASHTAGS = 30; // limite de hashtags por post do Instagram
export const MAX_TAG_LENGTH = 30;

export function parseEnum<T extends string>(values: readonly T[], value: unknown): T | null {
  const upper = typeof value === "string" ? value.trim().toUpperCase() : "";
  return (values as readonly string[]).includes(upper) ? (upper as T) : null;
}

/**
 * Normaliza tags vindas do cliente: aceita array ou string separada por vírgulas,
 * remove "#", espaços extras e duplicatas, e limita quantidade e tamanho.
 */
export function normalizeTags(value: unknown, maxTags = MAX_TAGS): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const tags = new Set<string>();

  for (const item of raw) {
    if (typeof item !== "string") continue;
    const tag = item.trim().replace(/^#+/, "").replace(/\s+/g, " ").toLowerCase().slice(0, MAX_TAG_LENGTH);
    if (tag) tags.add(tag);
    if (tags.size >= maxTags) break;
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

export const INVALID = Symbol("invalid");

/** Data opcional (ISO 8601): undefined = não enviada, null/"" = limpar, INVALID = formato inválido */
export function optionalDate(value: unknown): Date | null | undefined | typeof INVALID {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number") return INVALID;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? INVALID : date;
}

/** URL opcional http(s): undefined = não enviada, null/"" = limpar, INVALID = URL inválida */
export function optionalUrl(value: unknown, maxLength: number): string | null | undefined | typeof INVALID {
  const text = optionalText(value, Number.MAX_SAFE_INTEGER);
  if (text === undefined || text === null) return text;
  if (text.length > maxLength) return INVALID;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : INVALID;
  } catch {
    return INVALID;
  }
}
