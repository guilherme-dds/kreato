import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import multer from "multer";
import type { Prisma } from "../generated/prisma/client.js";
import prisma from "../utils/prisma.js";
import { logEvent } from "../utils/logger.js";
import { getPlanLimits, rejectPlanLimit } from "../utils/plans.js";
import { canManageWorkspace } from "../utils/workspaces.js";
import { parsePositiveInt } from "../utils/request.js";
import { deleteAssets, getAssetStream, uploadAssetFromFile } from "../utils/minio.js";
import { countStorageBytes } from "../utils/usage.js";

const MB = 1024 * 1024;
export const MAX_ATTACHMENT_MB = 100;

// Tipos aceitos: mídia, PDF, texto e documentos do Office. SVG fica de fora (pode conter scripts).
const ALLOWED_MIME_PREFIXES = ["video/", "audio/"];
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

/** Tipos exibidos direto no navegador; o resto é sempre baixado */
const INLINE_MIME_PREFIXES = ["image/", "video/", "audio/", "application/pdf"];

function isAllowedMime(mime: string): boolean {
  const normalized = mime.toLowerCase();
  return ALLOWED_MIME_TYPES.has(normalized) || ALLOWED_MIME_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

// Upload vai para disco temporário (não para a memória), já que vídeos podem ser grandes
const upload = multer({
  storage: multer.diskStorage({ destination: os.tmpdir() }),
  limits: { fileSize: MAX_ATTACHMENT_MB * MB, files: 1 },
});

/** Middleware de upload do campo "arquivo", com erros do multer convertidos em JSON */
export function attachmentUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("arquivo")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ error: `O arquivo excede o limite de ${MAX_ATTACHMENT_MB} MB por anexo.` });
      }
      return res.status(400).json({ error: "Upload inválido. Envie um único arquivo no campo 'arquivo'." });
    }
    if (err) return next(err);
    return next();
  });
}

const attachmentSelect = {
  id: true,
  conteudoId: true,
  nomeOriginal: true,
  tipoMime: true,
  tamanhoBytes: true,
  criadoEm: true,
  autor: { select: { id: true, nome: true } },
} satisfies Prisma.AnexoSelect;

async function storageUsage(req: Request) {
  return {
    usadoBytes: await countStorageBytes(req.workspaceId),
    limiteBytes: getPlanLimits(req.workspacePlan).armazenamentoMB * MB,
  };
}

/** O multer lê o nome do arquivo como latin1; navegadores enviam UTF-8 */
function decodeOriginalName(name: string): string {
  const decoded = Buffer.from(name, "latin1").toString("utf8");
  const clean = (decoded.includes("�") ? name : decoded).replace(/[\\/\u0000-\u001f]/g, "_").trim();
  return (clean || "arquivo").slice(0, 255);
}

async function findContent(req: Request) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return null;
  return prisma.conteudo.findFirst({ where: { id, workspaceId: req.workspaceId }, select: { id: true } });
}

export class AttachmentController {
  /** GET /conteudos/:id/anexos — anexos do conteúdo e uso de armazenamento do workspace */
  async index(req: Request, res: Response) {
    try {
      const conteudo = await findContent(req);
      if (!conteudo) return res.status(404).json({ error: "Conteúdo não encontrado." });

      const [anexos, uso] = await Promise.all([
        prisma.anexo.findMany({
          where: { conteudoId: conteudo.id },
          select: attachmentSelect,
          orderBy: { criadoEm: "desc" },
        }),
        storageUsage(req),
      ]);

      return res.json({ anexos, uso });
    } catch (error: any) {
      console.error("Erro ao listar anexos:", error);
      return res.status(500).json({ error: "Erro ao listar anexos." });
    }
  }

  /** POST /conteudos/:id/anexos (multipart, campo "arquivo") */
  async create(req: Request, res: Response) {
    const file = req.file;
    try {
      const conteudo = await findContent(req);
      if (!conteudo) return res.status(404).json({ error: "Conteúdo não encontrado." });
      if (!file) return res.status(400).json({ error: "Nenhum arquivo enviado." });

      if (!isAllowedMime(file.mimetype)) {
        return res.status(415).json({
          error: "Tipo de arquivo não suportado. Envie imagens, vídeos, áudios, PDFs, textos ou documentos do Office.",
        });
      }

      const uso = await storageUsage(req);
      if (uso.usadoBytes + file.size > uso.limiteBytes) {
        const limitMB = getPlanLimits(req.workspacePlan).armazenamentoMB;
        return rejectPlanLimit(
          req,
          res,
          "armazenamentoMB",
          Math.ceil(uso.usadoBytes / MB),
          `Este arquivo ultrapassa os ${limitMB} MB de armazenamento do seu plano. Exclua anexos antigos ou faça upgrade.`,
        );
      }

      const nomeOriginal = decodeOriginalName(file.originalname);
      const chave = `${req.workspaceId}/${conteudo.id}/${randomUUID()}${path.extname(nomeOriginal).toLowerCase().slice(0, 10)}`;

      await uploadAssetFromFile(chave, file.path, file.mimetype);

      let anexo;
      try {
        anexo = await prisma.anexo.create({
          data: {
            conteudoId: conteudo.id,
            workspaceId: req.workspaceId,
            autorId: req.userId,
            nomeOriginal,
            chave,
            tipoMime: file.mimetype.toLowerCase(),
            tamanhoBytes: file.size,
          },
          select: attachmentSelect,
        });
      } catch (error) {
        // Sem registro no banco o objeto ficaria órfão no bucket
        await deleteAssets([chave]);
        throw error;
      }

      await logEvent({
        userId: req.userId,
        acao: "ATTACHMENT_UPLOADED",
        req,
        entidade: "anexo",
        entidadeId: anexo.id,
        detalhes: { conteudoId: conteudo.id, tipoMime: anexo.tipoMime, tamanhoBytes: anexo.tamanhoBytes },
      });

      return res.status(201).json({
        anexo,
        uso: { ...uso, usadoBytes: uso.usadoBytes + anexo.tamanhoBytes },
      });
    } catch (error: any) {
      console.error("Erro ao enviar anexo:", error);
      return res.status(500).json({ error: "Erro ao enviar anexo." });
    } finally {
      if (file?.path) await unlink(file.path).catch(() => undefined);
    }
  }

  /** GET /anexos/:id/arquivo — transmite o arquivo (exige autenticação e acesso ao workspace) */
  async download(req: Request, res: Response) {
    try {
      const id = parsePositiveInt(req.params.id);
      if (!id) return res.status(400).json({ error: "ID de anexo inválido." });

      const anexo = await prisma.anexo.findFirst({
        where: { id, workspaceId: req.workspaceId },
        select: { chave: true, nomeOriginal: true, tipoMime: true, tamanhoBytes: true },
      });
      if (!anexo) return res.status(404).json({ error: "Anexo não encontrado." });

      const stream = await getAssetStream(anexo.chave);
      const disposition = INLINE_MIME_PREFIXES.some((prefix) => anexo.tipoMime.startsWith(prefix)) ? "inline" : "attachment";
      const asciiName = anexo.nomeOriginal.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");

      res.setHeader("Content-Type", anexo.tipoMime);
      res.setHeader("Content-Length", String(anexo.tamanhoBytes));
      res.setHeader(
        "Content-Disposition",
        `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(anexo.nomeOriginal)}`,
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, max-age=3600");

      stream.on("error", (err) => {
        console.error("Erro ao transmitir anexo:", err);
        res.destroy(err);
      });
      stream.pipe(res);
    } catch (error: any) {
      console.error("Erro ao baixar anexo:", error);
      if (!res.headersSent) res.status(404).json({ error: "Arquivo do anexo não encontrado." });
    }
  }

  /** DELETE /anexos/:id — apenas quem enviou, ou DONO/GESTOR do workspace */
  async delete(req: Request, res: Response) {
    try {
      const id = parsePositiveInt(req.params.id);
      if (!id) return res.status(400).json({ error: "ID de anexo inválido." });

      const anexo = await prisma.anexo.findFirst({
        where: { id, workspaceId: req.workspaceId },
        select: { chave: true, autorId: true, conteudoId: true, tamanhoBytes: true },
      });
      if (!anexo) return res.status(404).json({ error: "Anexo não encontrado." });

      if (anexo.autorId !== req.userId && !canManageWorkspace(req.workspaceRole)) {
        await logEvent({ userId: req.userId, acao: "PERMISSION_DENIED", req, entidade: "anexo", entidadeId: id });
        return res.status(403).json({ error: "Apenas quem enviou ou um gestor pode excluir este anexo." });
      }

      await prisma.anexo.delete({ where: { id } });
      await deleteAssets([anexo.chave]);

      await logEvent({
        userId: req.userId,
        acao: "ATTACHMENT_DELETED",
        req,
        entidade: "anexo",
        entidadeId: id,
        detalhes: { conteudoId: anexo.conteudoId, tamanhoBytes: anexo.tamanhoBytes },
      });

      return res.status(204).send();
    } catch (error: any) {
      console.error("Erro ao excluir anexo:", error);
      return res.status(500).json({ error: "Erro ao excluir anexo." });
    }
  }
}
