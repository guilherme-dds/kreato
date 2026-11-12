import type { ContentFormat, ContentStage, IdeaStatus, Platform } from "../types";

export const PLATFORMS: Platform[] = ["TIKTOK", "INSTAGRAM", "YOUTUBE", "OUTRA"];

export const PLATFORM_LABELS: Record<Platform, string> = {
  TIKTOK: "TikTok",
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
  OUTRA: "Outra",
};

export const IDEA_STATUSES: IdeaStatus[] = ["NOVA", "EM_DESENVOLVIMENTO", "ARQUIVADA"];

export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = {
  NOVA: "Nova",
  EM_DESENVOLVIMENTO: "Em desenvolvimento",
  ARQUIVADA: "Arquivada",
};

/** Converte o texto digitado ("#reels, dicas") em tags, espelhando a normalização do backend */
export function parseTagsInput(value: string, maxTags = 10, separator: RegExp = /,/): string[] {
  const tags = new Set<string>();
  for (const item of value.split(separator)) {
    const tag = item.trim().replace(/^#+/, "").replace(/\s+/g, " ").toLowerCase().slice(0, 30);
    if (tag) tags.add(tag);
    if (tags.size >= maxTags) break;
  }
  return [...tags];
}

export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (diffDays <= 0) return "hoje";
  if (diffDays === 1) return "ontem";
  if (diffDays < 7) return `há ${diffDays} dias`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/** Etapas do pipeline, na ordem das colunas do kanban */
export const CONTENT_STAGES: ContentStage[] = ["IDEIA", "ROTEIRO", "GRAVACAO", "EDICAO", "AGENDADO", "PUBLICADO"];

export const CONTENT_STAGE_LABELS: Record<ContentStage, string> = {
  IDEIA: "Ideia",
  ROTEIRO: "Roteiro",
  GRAVACAO: "Gravação",
  EDICAO: "Edição",
  AGENDADO: "Agendado",
  PUBLICADO: "Publicado",
};

/** Etapas em que um conteúdo pode nascer direto (agendar/publicar exigem data) */
export const CREATABLE_STAGES: ContentStage[] = ["IDEIA", "ROTEIRO", "GRAVACAO", "EDICAO"];

export const CONTENT_FORMATS: ContentFormat[] = ["VIDEO_CURTO", "VIDEO_LONGO", "CARROSSEL", "IMAGEM", "STORY", "LIVE"];

export const CONTENT_FORMAT_LABELS: Record<ContentFormat, string> = {
  VIDEO_CURTO: "Vídeo curto",
  VIDEO_LONGO: "Vídeo longo",
  CARROSSEL: "Carrossel",
  IMAGEM: "Imagem",
  STORY: "Story",
  LIVE: "Live",
};

export function parseHashtagsInput(value: string): string[] {
  // Hashtags não têm espaços: aceita "#a #b", "#a, #b" ou uma por linha
  return parseTagsInput(value, 30, /[\s,]+/);
}

/** Valor para <input type="datetime-local"> no fuso local */
export function toDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** Converte o valor de <input type="datetime-local"> em ISO (ou null se vazio) */
export function fromDateTimeLocal(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Ritmo médio de fala em vídeos curtos (palavras por minuto)
const WORDS_PER_MINUTE = 150;

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/** Duração estimada de leitura do roteiro em voz alta, ex.: "45s" ou "2min 10s" */
export function estimateSpeakingTime(words: number): string {
  const seconds = Math.round((words / WORDS_PER_MINUTE) * 60);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}min ${rest}s` : `${minutes}min`;
}


/** Número de cena da claquete: 42 → "042" */
export function sceneNumber(id: number): string {
  return String(id).padStart(3, "0");
}
