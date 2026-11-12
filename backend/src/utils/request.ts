/** Lê um parâmetro de query string, ignorando valores vazios */
export function queryString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Inteiro de query string limitado a [1, max]; ausente ou inválido usa o padrão */
export function queryLimit(value: unknown, fallback: number, max: number): number {
  const parsed = parsePositiveInt(queryString(value));
  return parsed ? Math.min(parsed, max) : fallback;
}

/** Converte um parâmetro de rota em ID inteiro positivo (ou null se inválido) */
export function parsePositiveInt(value: unknown): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
