export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024; // espelha o limite por arquivo do backend

/** Tipos aceitos pelo backend, usados no atributo accept do seletor de arquivos */
export const ATTACHMENT_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "video/*",
  "audio/*",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  ".docx",
  ".xlsx",
  ".pptx",
].join(",");

export type FileKind = "image" | "video" | "audio" | "pdf" | "document";

export function fileKind(mime: string): FileKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  return "document";
}

/** Tipos que o navegador consegue exibir em uma nova aba */
export function canPreviewInBrowser(mime: string): boolean {
  return fileKind(mime) !== "document" || mime === "text/plain";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}
