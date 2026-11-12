import type { Express } from "express";
import cors from "cors";
import helmet from "helmet";

/**
 * Proxies confiáveis para ler o IP real (X-Forwarded-For) e o protocolo (X-Forwarded-Proto).
 * Padrão: endereços de rede privada (o nginx da stack e proxies internos da hospedagem).
 * TRUST_PROXY aceita um número de saltos, true/false ou uma lista de IPs/sub-redes.
 */
function trustProxySetting(): boolean | number | string {
  const raw = process.env.TRUST_PROXY?.trim();
  if (!raw) return "loopback, linklocal, uniquelocal";
  if (raw === "true") return true;
  if (raw === "false") return false;
  const hops = Number(raw);
  return Number.isInteger(hops) ? hops : raw;
}

/** Documentação da API: liberada fora de produção ou com ENABLE_API_DOCS=true */
export const apiDocsEnabled =
  process.env.ENABLE_API_DOCS === "true" ||
  (process.env.ENABLE_API_DOCS !== "false" && process.env.NODE_ENV !== "production");

/**
 * Cabeçalhos de segurança e CORS. Em produção o frontend chega pelo mesmo domínio (nginx),
 * então o CORS fica fechado; CORS_ORIGINS libera origens específicas (separadas por vírgula).
 */
export function applySecurity(app: Express): void {
  app.disable("x-powered-by");
  app.set("trust proxy", trustProxySetting());

  // API só responde JSON: CSP fica no nginx do frontend; CORP desligado para anexos e avatares
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));

  const origins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin: origins.length > 0 ? origins : process.env.NODE_ENV !== "production",
      credentials: true,
    }),
  );
}
