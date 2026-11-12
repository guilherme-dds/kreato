import type { Request } from "express";
import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const STREAM_KEY = "logs:stream";

// Reconecta para sempre (com espera crescente até 10s): se o Redis reiniciar, a auditoria volta sozinha.
// Sem fila offline: enquanto estiver fora, o XADD falha na hora em vez de segurar a requisição.
const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: (times) => Math.min(times * 1000, 10_000),
});

redis.on("error", () => {
  // Silent catch to prevent crashing app if Redis is unreachable
});

/**
 * IP de quem fez a requisição. O Express resolve o X-Forwarded-For só a partir dos proxies
 * confiáveis (TRUST_PROXY), então um cabeçalho forjado pelo cliente não muda o IP registrado.
 */
export function getClientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

/**
 * Publica um evento de auditoria no Redis Stream.
 * Eventos de negócio informam a entidade afetada (ex.: entidade "ideia", entidadeId "42")
 * e detalhes livres em JSON (ex.: { de: "ROTEIRO", para: "GRAVACAO" }).
 */
export async function logEvent({
  userId,
  acao,
  req,
  entidade,
  entidadeId,
  detalhes,
}: {
  userId?: string | number | null;
  acao: string;
  req: Request;
  entidade?: string;
  entidadeId?: string | number | null;
  detalhes?: Record<string, unknown>;
}) {
  try {
    const ip = getClientIp(req);
    const timestamp = new Date().toISOString();
    const user_id = userId ? String(userId) : "anonymous";

    if (redis.status === "wait" || redis.status === "end") {
      await redis.connect().catch(() => {});
    }

    const fields: string[] = ["user_id", user_id, "acao", acao, "timestamp", timestamp, "ip", ip];
    if (entidade) fields.push("entidade", entidade);
    if (entidadeId !== undefined && entidadeId !== null) fields.push("entidade_id", String(entidadeId));
    if (detalhes) fields.push("detalhes", JSON.stringify(detalhes));

    await redis.xadd(STREAM_KEY, "*", ...fields);
  } catch (err: any) {
    console.error(`[LOGGER WARNING] Falha ao enviar log XADD (${acao}):`, err?.message || err);
  }
}
