import type { NextFunction, Request, Response } from "express";
import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Cliente próprio: o limitador precisa reconectar sempre (o do logger desiste após poucas tentativas)
const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: (times) => Math.min(times * 500, 5000),
});

redis.on("error", () => {
  // Sem Redis o limitador libera a requisição (fail-open): login nunca fica fora do ar por causa dele
});

interface LimitRule {
  /** Prefixo da chave no Redis, ex.: "login:ip" */
  name: string;
  /** Máximo de requisições na janela */
  max: number;
  /** Tamanho da janela em segundos */
  windowSec: number;
  /** Identificador limitado; null pula a regra (ex.: corpo sem e-mail) */
  key: (req: Request) => string | null;
}

const byIp = (req: Request) => req.ip || req.socket.remoteAddress || "unknown";
const byEmail = (req: Request) => {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
};

/** Conta uma tentativa e devolve quantos segundos faltam para liberar, se estourou o limite */
async function hit(rule: LimitRule, id: string): Promise<number | null> {
  if (redis.status === "wait") await redis.connect().catch(() => {});
  if (redis.status !== "ready") return null;

  const key = `ratelimit:${rule.name}:${id}`;
  // Cria a chave com a validade da janela só se ainda não existir, depois conta (atômico no MULTI)
  const results = await redis.multi().set(key, 0, "EX", rule.windowSec, "NX").incr(key).ttl(key).exec();
  const count = Number(results?.[1]?.[1] ?? 0);
  const ttl = Number(results?.[2]?.[1] ?? rule.windowSec);
  return count > rule.max ? Math.max(ttl, 1) : null;
}

/**
 * Limita tentativas por janela fixa no Redis. Todas as regras contam a requisição;
 * a primeira que estourar responde 429 com Retry-After.
 */
export function rateLimit(...rules: LimitRule[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      for (const rule of rules) {
        const id = rule.key(req);
        if (!id) continue;
        const retryAfter = await hit(rule, id);
        if (retryAfter !== null) {
          res.setHeader("Retry-After", String(retryAfter));
          const minutes = Math.ceil(retryAfter / 60);
          return res.status(429).json({
            error: `Muitas tentativas. Tente novamente em ${minutes} minuto${minutes === 1 ? "" : "s"}.`,
            code: "RATE_LIMITED",
          });
        }
      }
    } catch (error) {
      console.warn("[rate-limit] Falha ao consultar o Redis; liberando a requisição.", error);
    }
    return next();
  };
}

const MIN = 60;
const HOUR = 60 * MIN;

/** Login: força bruta por IP e por conta */
export const loginLimit = rateLimit(
  { name: "login:ip", max: 30, windowSec: 15 * MIN, key: byIp },
  { name: "login:email", max: 8, windowSec: 15 * MIN, key: byEmail },
);

/** Cadastro: criação de contas em massa */
export const signupLimit = rateLimit({ name: "signup:ip", max: 10, windowSec: HOUR, key: byIp });

/** Pedido de redefinição: evita usar o Kreato para disparar e-mails */
export const resetRequestLimit = rateLimit(
  { name: "reset:ip", max: 10, windowSec: HOUR, key: byIp },
  { name: "reset:email", max: 3, windowSec: HOUR, key: byEmail },
);

/** Confirmação da redefinição: tentativas de adivinhar o token */
export const resetConfirmLimit = rateLimit({ name: "reset-confirm:ip", max: 20, windowSec: 15 * MIN, key: byIp });

/** Renovação de sessão */
export const refreshLimit = rateLimit({ name: "refresh:ip", max: 120, windowSec: 15 * MIN, key: byIp });
