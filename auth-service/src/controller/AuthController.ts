import type { Request, Response } from "express";
import prisma from "../utils/prisma.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { logEvent } from "../utils/logger.js";
import {
  BCRYPT_COST,
  MIN_PASSWORD_LENGTH,
  clearRefreshCookie,
  findRefreshToken,
  hashToken,
  issueRefreshToken,
  publicUser,
  readRefreshToken,
  retireRefreshToken,
  setRefreshCookie,
  signAccessToken,
} from "../utils/session.js";

const INVALID_CREDENTIALS = "E-mail ou senha inválidos.";
const INTERNAL_ERROR = "Erro interno. Tente novamente em instantes.";

/**
 * Hash usado quando o e-mail não existe: o login leva o mesmo tempo com ou sem conta,
 * então a resposta não revela quais e-mails estão cadastrados.
 */
const DUMMY_HASH = bcrypt.hashSync("kreato-dummy-password", BCRYPT_COST);

/** Contas novas ficam com e-mail em minúsculas; no login a comparação já ignora caixa (collation do MySQL) */
function normalizeEmail(value: unknown, lowercase = false): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return lowercase ? value.trim().toLowerCase() : value.trim();
}

export class AuthController {
  async create(req: Request, res: Response) {
    try {
      const { nome, password } = req.body || {};
      const email = normalizeEmail(req.body?.email, true);

      if (!email || typeof password !== "string" || !password || typeof nome !== "string" || !nome.trim()) {
        return res.status(400).json({ error: "Nome, e-mail e senha são obrigatórios." });
      }

      if (password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });
      }

      const userExists = await prisma.usuario.findUnique({ where: { email } });
      if (userExists) {
        // Sem verificação de e-mail não há como esconder isso no cadastro; o limite de tentativas freia varreduras
        return res.status(409).json({ error: "Já existe uma conta com este e-mail." });
      }

      // Self-registration always creates a creator; admins are promoted directly in the database
      const user = await prisma.usuario.create({
        data: {
          nome: nome.trim(),
          email,
          senhaHash: await bcrypt.hash(password, BCRYPT_COST),
          role: "creator",
          plano: "FREE",
        },
        select: {
          id: true,
          nome: true,
          email: true,
          role: true,
          plano: true,
          bio: true,
          fotoPerfil: true,
          criadoEm: true,
        },
      });

      return res.status(201).json({ user });
    } catch (error) {
      console.error("Error in auth-service create:", error);
      await logEvent({ acao: "ERROR", req });
      return res.status(500).json({ error: INTERNAL_ERROR });
    }
  }

  async authenticate(req: Request, res: Response) {
    try {
      const { password } = req.body || {};
      const email = normalizeEmail(req.body?.email);

      if (!email || typeof password !== "string" || !password) {
        return res.status(400).json({ error: "Informe e-mail e senha." });
      }

      const user = await prisma.usuario.findUnique({ where: { email } });
      const passwordMatches = await bcrypt.compare(password, user?.senhaHash ?? DUMMY_HASH);

      if (!user || !passwordMatches) {
        return res.status(401).json({ error: INVALID_CREDENTIALS });
      }

      // Hashes antigos (custo 8) são refeitos com o custo atual no primeiro login
      if (bcrypt.getRounds(user.senhaHash) < BCRYPT_COST) {
        const senhaHash = await bcrypt.hash(password, BCRYPT_COST);
        await prisma.usuario.update({ where: { id: user.id }, data: { senhaHash } }).catch(() => {});
      }

      const token = signAccessToken(user);
      setRefreshCookie(req, res, await issueRefreshToken(user.id));

      await logEvent({ userId: user.id, acao: "LOGIN", req });

      return res.json({ user: publicUser(user), token });
    } catch (error) {
      console.error("Error in auth-service authenticate:", error);
      await logEvent({ acao: "ERROR", req });
      return res.status(500).json({ error: INTERNAL_ERROR });
    }
  }

  async logout(req: Request, res: Response) {
    try {
      let userId: string | null = null;

      const authHeader = req.headers.authorization;
      if (authHeader) {
        const [type, token] = authHeader.split(" ");
        if (type === "Bearer" && token && process.env.JWT_SECRET) {
          try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true }) as any;
            if (typeof decoded?.id === "string") userId = decoded.id;
          } catch {
            // token inválido: o logout segue só com o cookie
          }
        }
      }

      const refreshToken = readRefreshToken(req);
      if (refreshToken) {
        await prisma.refreshToken
          .deleteMany({ where: { token: { in: [hashToken(refreshToken), refreshToken] } } })
          .catch(() => {});
      }

      clearRefreshCookie(req, res);
      await logEvent({ userId, acao: "LOGOUT", req });
      return res.json({ message: "Logout realizado com sucesso" });
    } catch (error) {
      console.error("Error in auth-service logout:", error);
      await logEvent({ acao: "ERROR", req });
      return res.status(500).json({ error: INTERNAL_ERROR });
    }
  }

  /**
   * Troca o refresh token (cookie) por um access token novo. O refresh token também é trocado:
   * o antigo deixa de valer após uma janela curta de tolerância.
   */
  async refresh(req: Request, res: Response) {
    try {
      const refreshToken = readRefreshToken(req);
      if (!refreshToken) {
        return res.status(401).json({ error: "Sessão não encontrada." });
      }

      const storedToken = await findRefreshToken(refreshToken);
      if (!storedToken || storedToken.expiresAt < new Date()) {
        if (storedToken) await prisma.refreshToken.delete({ where: { id: storedToken.id } }).catch(() => {});
        clearRefreshCookie(req, res);
        return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
      }

      const token = signAccessToken(storedToken.usuario);
      const nextRefresh = await issueRefreshToken(storedToken.usuarioId);
      await retireRefreshToken(storedToken.id);
      setRefreshCookie(req, res, nextRefresh);

      return res.json({ token, user: publicUser(storedToken.usuario) });
    } catch (error) {
      console.error("Error in auth-service refresh:", error);
      await logEvent({ acao: "ERROR", req });
      return res.status(500).json({ error: INTERNAL_ERROR });
    }
  }

  async verify(req: Request, res: Response) {
    try {
      const authHeader = req.headers.authorization;
      let token = req.body?.token;

      if (!token && authHeader) {
        const [type, authToken] = authHeader.split(" ");
        if (type === "Bearer" && authToken) {
          token = authToken;
        }
      }

      if (!token) {
        return res.status(401).json({ valid: false, error: "Token not provided" });
      }

      const JWT_SECRET = process.env.JWT_SECRET;
      if (!JWT_SECRET) {
        console.error("JWT_SECRET is not configured");
        return res.status(500).json({ valid: false, error: INTERNAL_ERROR });
      }

      const decoded = jwt.verify(token, JWT_SECRET) as any;

      if (typeof decoded === "string" || typeof decoded.id !== "string") {
        return res.status(401).json({ valid: false, error: "Token invalid" });
      }

      // Papel atual do banco (o do token pode ter até 15 min): os serviços usam para checar admin
      const user = await prisma.usuario.findUnique({ where: { id: decoded.id }, select: { role: true } });
      if (!user) {
        return res.status(401).json({ valid: false, error: "Token invalid" });
      }

      return res.json({ valid: true, userId: decoded.id, role: user.role });
    } catch {
      return res.status(401).json({ valid: false, error: "Token invalid" });
    }
  }
}
