import type { Request, Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import prisma from "./prisma.js";

/** Cookie httpOnly com o refresh token: o JavaScript da página nunca o enxerga */
export const REFRESH_COOKIE = "kreato_rt";
const REFRESH_TTL_DAYS = 7;
/**
 * Depois de girar, o token antigo ainda vale por alguns segundos: duas abas que renovam
 * ao mesmo tempo não derrubam a sessão uma da outra.
 */
const ROTATION_GRACE_MS = 30_000;

export const BCRYPT_COST = 12;
export const MIN_PASSWORD_LENGTH = 8;

/** No banco fica só o SHA-256 do token; um vazamento da tabela não entrega sessões */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function signAccessToken(user: { id: string; role: string }): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return jwt.sign({ id: user.id, role: user.role }, secret, { expiresIn: "15m" });
}

/** Cria um refresh token novo para o usuário e devolve o valor em claro (só vai para o cookie) */
export async function issueRefreshToken(usuarioId: string): Promise<string> {
  const value = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({ data: { token: hashToken(value), usuarioId, expiresAt } });
  // Faxina: sessões vencidas do usuário não precisam continuar na tabela
  await prisma.refreshToken.deleteMany({ where: { usuarioId, expiresAt: { lt: new Date() } } }).catch(() => {});

  return value;
}

/**
 * Localiza o refresh token apresentado. Tokens emitidos antes do hash ficavam em claro:
 * eles ainda são aceitos até vencerem (no máximo 7 dias) e, no primeiro uso, são trocados.
 */
export function findRefreshToken(value: string) {
  return prisma.refreshToken.findFirst({
    where: { token: { in: [hashToken(value), value] } },
    include: { usuario: true },
  });
}

/** Encurta a validade do token girado para a janela de tolerância */
export async function retireRefreshToken(id: number): Promise<void> {
  const graceEnd = new Date(Date.now() + ROTATION_GRACE_MS);
  await prisma.refreshToken.updateMany({
    where: { id, expiresAt: { gt: graceEnd } },
    data: { expiresAt: graceEnd },
  });
}

function isSecureRequest(req: Request): boolean {
  const forced = process.env.COOKIE_SECURE;
  if (forced === "true") return true;
  if (forced === "false") return false;
  return req.secure;
}

export function setRefreshCookie(req: Request, res: Response, value: string): void {
  res.cookie(REFRESH_COOKIE, value, {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: "strict",
    path: "/",
    maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(req: Request, res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: "strict",
    path: "/",
  });
}

/** Lê o refresh token do cookie (ou do corpo, para sessões abertas antes da mudança para cookie) */
export function readRefreshToken(req: Request): string | null {
  const header = req.headers.cookie;
  if (header) {
    for (const part of header.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name === REFRESH_COOKIE && rest.length > 0) {
        try {
          return decodeURIComponent(rest.join("="));
        } catch {
          return null;
        }
      }
    }
  }
  const legacy = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
  return typeof legacy === "string" && legacy.length > 0 ? legacy : null;
}

export function publicUser(user: {
  id: string;
  email: string;
  nome: string;
  role: string;
  plano: string;
  statusAssinatura?: string | null;
  bio: string | null;
  fotoPerfil: string | null;
}) {
  const { id, email, nome, role, plano, bio, fotoPerfil } = user;
  return {
    id,
    email,
    nome,
    role,
    plano,
    statusAssinatura: user.statusAssinatura ?? null,
    bio: bio || "",
    fotoPerfil: fotoPerfil || null,
  };
}
