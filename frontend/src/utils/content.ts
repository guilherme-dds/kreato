import type { IdeaStatus, Platform } from "../types";

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
export function parseTagsInput(value: string): string[] {
  const tags = new Set<string>();
  for (const item of value.split(",")) {
    const tag = item.trim().replace(/^#+/, "").replace(/\s+/g, " ").toLowerCase().slice(0, 30);
    if (tag) tags.add(tag);
    if (tags.size >= 10) break;
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
