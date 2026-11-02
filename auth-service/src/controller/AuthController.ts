import type { Request, Response } from "express";
import prisma from "../utils/prisma.js";
import { compare, hash } from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { logEvent } from "../utils/logger.js";

export class AuthController {
  async create(req: Request, res: Response) {
    try {
      const { nome, email, password } = req.body || {};

      if (!email || !password || !nome) {
        return res.status(400).json({ error: "Nome, email e senha são obrigatórios." });
      }

      const hash_password = await hash(password, 8);

      const userExists = await prisma.usuario.findUnique({
        where: {
          email,
        },
      });

      if (userExists) {
        return res.status(400).json({ error: "User exists" });
      }

      // Self-registration always creates a creator; admins are promoted directly in the database
      const user = await prisma.usuario.create({
        data: {
          nome,
          email,
          senhaHash: hash_password,
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
    } catch (error: any) {
      console.error("Error in auth-service create:", error);
      await logEvent({ acao: "ERROR", req });
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  async authenticate(req: Request, res: Response) {
    try {
      const { email, password } = req.body || {};

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const user = await prisma.usuario.findUnique({
        where: {
          email,
        },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const isValuePassword = await compare(password, user.senhaHash);

      if (!isValuePassword) {
        return res.status(401).json({ message: "Password invalid" });
      }

      const JWT_SECRET = process.env.JWT_SECRET;
      if (!JWT_SECRET) {
        await logEvent({ userId: user.id, acao: "ERROR", req });
        return res.status(500).json({ error: "JWT_SECRET is not configured" });
      }

      const token = jwt.sign(
        { id: user.id, role: user.role },
        JWT_SECRET,
        { expiresIn: "15m" }
      );

      const refreshTokenValue = randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await prisma.refreshToken.create({
        data: {
          token: refreshTokenValue,
          usuarioId: user.id,
          expiresAt,
        },
      });

      const { id, nome, role, plano, bio, fotoPerfil } = user;

      // Log LOGIN event to Redis Stream via XADD
      await logEvent({ userId: id, acao: "LOGIN", req });

      return res.json({
        user: { id, email, nome, role, plano, bio: bio || "", fotoPerfil: fotoPerfil || null },
        token,
        refreshToken: refreshTokenValue,
      });
    } catch (error: any) {
      console.error("Error in auth-service authenticate:", error);
      await logEvent({ acao: "ERROR", req });
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  async logout(req: Request, res: Response) {
    try {
      const { refreshToken, userId: bodyUserId } = req.body || {};
      let userId: string | null = bodyUserId || null;

      const authHeader = req.headers.authorization;
      if (authHeader) {
        const [type, token] = authHeader.split(" ");
        if (type === "Bearer" && token && process.env.JWT_SECRET) {
          try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET) as any;
            if (decoded?.id) {
              userId = decoded.id;
            }
          } catch {
            // token could be expired
          }
        }
      }

      if (refreshToken) {
        await prisma.refreshToken.deleteMany({ where: { token: refreshToken } }).catch(() => {});
      }

      await logEvent({ userId, acao: "LOGOUT", req });
      return res.json({ message: "Logout realizado com sucesso" });
    } catch (error: any) {
      console.error("Error in auth-service logout:", error);
      await logEvent({ acao: "ERROR", req });
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  }

  async refresh(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body || {};

      if (!refreshToken) {
        return res.status(400).json({ error: "Refresh token is required" });
      }

      const storedToken = await prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { usuario: true },
      });

      if (!storedToken) {
        return res.status(401).json({ error: "Invalid refresh token" });
      }

      if (storedToken.expiresAt < new Date()) {
        await prisma.refreshToken.delete({ where: { id: storedToken.id } });
        return res.status(401).json({ error: "Refresh token expired" });
      }

      const JWT_SECRET = process.env.JWT_SECRET;
      if (!JWT_SECRET) {
        await logEvent({ userId: storedToken.usuarioId, acao: "ERROR", req });
        return res.status(500).json({ error: "JWT_SECRET is not configured" });
      }

      const newToken = jwt.sign(
        { id: storedToken.usuarioId, role: storedToken.usuario.role },
        JWT_SECRET,
        { expiresIn: "15m" }
      );

      return res.json({
        token: newToken,
        refreshToken: storedToken.token,
      });
    } catch (error: any) {
      console.error("Error in auth-service refresh:", error);
      await logEvent({ acao: "ERROR", req });
      return res.status(500).json({ error: error.message || "Internal server error" });
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
        return res.status(500).json({ valid: false, error: "JWT_SECRET is not configured" });
      }

      const decoded = jwt.verify(token, JWT_SECRET) as any;

      if (typeof decoded === "string" || typeof decoded.id !== "string") {
        return res.status(401).json({ valid: false, error: "Token invalid" });
      }

      return res.json({ valid: true, userId: decoded.id, role: decoded.role });
    } catch (error: any) {
      return res.status(401).json({ valid: false, error: error.message || "Token invalid" });
    }
  }
}
