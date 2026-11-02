import type { Request } from "express";
import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const STREAM_KEY = "logs:stream";

const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy(times) {
    if (times > 3) return null;
    return 1000;
  },
});

redis.on("error", () => {
  // Silent catch to prevent crashing app if Redis is unreachable
});

export function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const firstIp = forwarded.split(",")[0];
    if (firstIp) return firstIp.trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    const firstIp = forwarded[0];
    if (firstIp) return firstIp.trim();
  }
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string") {
    return realIp.trim();
  }
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

    if (redis.status !== "ready" && redis.status !== "connecting") {
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
