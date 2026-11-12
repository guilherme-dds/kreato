import type { Request, Response } from "express";
import prisma from "../utils/prisma.js";
import {
  uploadAvatarToMinio,
  getAvatarFromMinio,
  deleteAvatarFromMinio,
} from "../utils/minio.js";

export class UserController {
  async index(req: Request, res: Response) {
    const users = await prisma.usuario.findMany({
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
    return res.json({ users });
  }

  async getProfile(req: Request, res: Response) {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const user = await prisma.usuario.findUnique({
        where: { id: userId },
        select: {
          id: true,
          nome: true,
          email: true,
          role: true,
          plano: true,
          statusAssinatura: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          bio: true,
          fotoPerfil: true,
          criadoEm: true,
        },
      });

      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado." });
      }

      // O plano vem só do banco: quem o atualiza são os webhooks do Stripe
      return res.json({ user });
    } catch (error: any) {
      console.error("Erro ao buscar perfil:", error);
      return res.status(500).json({ error: "Erro interno do servidor." });
    }
  }

  async updateProfile(req: Request, res: Response) {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const { bio, nome, fotoPerfil } = req.body || {};

      const dataToUpdate: Record<string, any> = {};
      if (typeof bio === "string") {
        dataToUpdate.bio = bio.trim();
      }
      if (typeof nome === "string" && nome.trim().length > 0) {
        dataToUpdate.nome = nome.trim();
      }
      if (typeof fotoPerfil === "string") {
        dataToUpdate.fotoPerfil = fotoPerfil;
      }

      const updatedUser = await prisma.usuario.update({
        where: { id: userId },
        data: dataToUpdate,
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

      return res.json({ user: updatedUser, message: "Perfil atualizado com sucesso." });
    } catch (error: any) {
      console.error("Erro ao atualizar perfil:", error);
      return res.status(500).json({ error: "Erro ao atualizar perfil do usuário." });
    }
  }

  /**
   * Upload de foto de perfil para o MinIO e salvamento da referência no MySQL
   */
  async uploadAvatar(req: Request, res: Response) {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "Nenhum arquivo de imagem foi enviado." });
      }

      const allowedMimetypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
      if (!allowedMimetypes.includes(file.mimetype.toLowerCase()) && !file.mimetype.startsWith("image/")) {
        return res.status(400).json({
          error: "Formato de arquivo inválido. Apenas imagens (JPG, PNG, WEBP, GIF) são permitidas.",
        });
      }

      const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
      if (file.size > MAX_FILE_SIZE) {
        return res.status(400).json({
          error: "O tamanho da imagem não pode ultrapassar 5MB.",
        });
      }

      const currentUser = await prisma.usuario.findUnique({
        where: { id: userId },
        select: { fotoPerfil: true },
      });

      if (currentUser?.fotoPerfil) {
        await deleteAvatarFromMinio(currentUser.fotoPerfil);
      }

      const { url } = await uploadAvatarToMinio(
        file.buffer,
        file.originalname,
        file.mimetype,
        userId
      );

      const updatedUser = await prisma.usuario.update({
        where: { id: userId },
        data: { fotoPerfil: url },
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

      return res.json({
        user: updatedUser,
        message: "Foto de perfil atualizada com sucesso no MinIO e no banco de dados!",
      });
    } catch (error: any) {
      console.error("Erro ao fazer upload da foto de perfil:", error);
      return res.status(500).json({
        error: "Erro ao processar e salvar a foto de perfil.",
      });
    }
  }

  /**
   * Serve a foto de perfil armazenada no MinIO
   */
  async serveAvatar(req: Request, res: Response) {
    try {
      const filenameRaw = req.params.filename;
      const filename = Array.isArray(filenameRaw) ? filenameRaw[0] : filenameRaw;
      if (!filename) {
        return res.status(400).json({ error: "Nome do arquivo é obrigatório." });
      }

      const stream = await getAvatarFromMinio(filename);

      const ext = filename.split(".").pop()?.toLowerCase();
      let contentType = "image/jpeg";
      if (ext === "png") contentType = "image/png";
      else if (ext === "webp") contentType = "image/webp";
      else if (ext === "gif") contentType = "image/gif";
      else if (ext === "svg") contentType = "image/svg+xml";

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400"); // Cache de 1 dia

      stream.pipe(res);
    } catch (error: any) {
      console.error("Erro ao carregar avatar do MinIO:", error);
      return res.status(404).json({ error: "Foto de perfil não encontrada." });
    }
  }

  /**
   * Remove a foto de perfil do MinIO e limpa a referência no MySQL
   */
  async removeAvatar(req: Request, res: Response) {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const currentUser = await prisma.usuario.findUnique({
        where: { id: userId },
        select: { fotoPerfil: true },
      });

      if (currentUser?.fotoPerfil) {
        await deleteAvatarFromMinio(currentUser.fotoPerfil);
      }

      const updatedUser = await prisma.usuario.update({
        where: { id: userId },
        data: { fotoPerfil: null },
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

      return res.json({
        user: updatedUser,
        message: "Foto de perfil removida com sucesso.",
      });
    } catch (error: any) {
      console.error("Erro ao remover avatar:", error);
      return res.status(500).json({ error: "Erro ao remover a foto de perfil." });
    }
  }
}
