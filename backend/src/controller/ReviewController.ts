import type { Request, Response } from "express";
import type { Prisma } from "../generated/prisma/client.js";
import prisma from "../utils/prisma.js";
import { logEvent } from "../utils/logger.js";
import { parsePositiveInt } from "../utils/request.js";
import type { ContentStage } from "../utils/content.js";
import { canReviewScript, isManager } from "../utils/permissions.js";

const COMMENT_MAX_LENGTH = 2000;

const commentSelect = {
  id: true,
  texto: true,
  tipo: true,
  etapa: true,
  resolvido: true,
  resolvidoEm: true,
  criadoEm: true,
  atualizadoEm: true,
  autor: { select: { id: true, nome: true, fotoPerfil: true } },
  resolvidoPor: { select: { id: true, nome: true } },
} satisfies Prisma.ComentarioConteudoSelect;

type CommentRecord = Prisma.ComentarioConteudoGetPayload<{ select: typeof commentSelect }>;

function serializeComment(req: Request, comment: CommentRecord, contentAuthorId: string | null) {
  const isAuthor = comment.autor?.id === req.userId;
  return {
    ...comment,
    podeEditar: isAuthor && comment.tipo === "COMENTARIO",
    podeExcluir: isAuthor || isManager(req.workspaceRole),
    // Quem escreveu, o autor do conteúdo (ex.: roteirista que fez o ajuste) ou um gestor
    podeResolver: isAuthor || contentAuthorId === req.userId || isManager(req.workspaceRole),
  };
}

function parseText(value: unknown): { texto: string } | { error: string } {
  if (typeof value !== "string" || value.trim().length === 0) return { error: "Escreva o comentário." };
  const texto = value.trim();
  if (texto.length > COMMENT_MAX_LENGTH) {
    return { error: `O comentário deve ter até ${COMMENT_MAX_LENGTH} caracteres.` };
  }
  return { texto };
}

async function findContent(req: Request) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return null;
  return prisma.conteudo.findFirst({
    where: { id, workspaceId: req.workspaceId },
    select: { id: true, etapa: true, autorId: true, roteiroAprovadoEm: true },
  });
}

async function findComment(req: Request) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return null;
  return prisma.comentarioConteudo.findFirst({
    where: { id, workspaceId: req.workspaceId },
    select: { id: true, autorId: true, tipo: true, resolvido: true, conteudo: { select: { id: true, autorId: true } } },
  });
}

/** Próxima posição livre no fim da coluna (mesma regra do ContentController) */
async function nextPosition(tx: Prisma.TransactionClient, workspaceId: string, etapa: ContentStage) {
  const result = await tx.conteudo.aggregate({ where: { workspaceId, etapa }, _max: { posicao: true } });
  return (result._max.posicao ?? -1) + 1;
}

/** Comentários de revisão, aprovação de roteiro e pedidos de ajuste */
export class ReviewController {
  /** GET /conteudos/:id/comentarios — todos os membros veem a conversa */
  async index(req: Request, res: Response) {
    try {
      const content = await findContent(req);
      if (!content) return res.status(404).json({ error: "Conteúdo não encontrado." });

      const comments = await prisma.comentarioConteudo.findMany({
        where: { conteudoId: content.id },
        orderBy: { criadoEm: "asc" },
        select: commentSelect,
      });

      return res.json({ comentarios: comments.map((comment) => serializeComment(req, comment, content.autorId)) });
    } catch (error: any) {
      console.error("Erro ao listar comentários:", error);
      return res.status(500).json({ error: "Erro ao listar comentários." });
    }
  }

  /** POST /conteudos/:id/comentarios — corpo { texto }; qualquer membro comenta */
  async create(req: Request, res: Response) {
    try {
      const content = await findContent(req);
      if (!content) return res.status(404).json({ error: "Conteúdo não encontrado." });

      const parsed = parseText(req.body?.texto);
      if ("error" in parsed) return res.status(400).json({ error: parsed.error });

      const comment = await prisma.comentarioConteudo.create({
        data: {
          conteudoId: content.id,
          workspaceId: req.workspaceId,
          autorId: req.userId,
          texto: parsed.texto,
          etapa: content.etapa,
        },
        select: commentSelect,
      });

      await logEvent({
        userId: req.userId,
        acao: "COMMENT_CREATED",
        req,
        entidade: "conteudo",
        entidadeId: content.id,
        detalhes: { comentarioId: comment.id, etapa: content.etapa },
      });

      return res.status(201).json({ comentario: serializeComment(req, comment, content.autorId) });
    } catch (error: any) {
      console.error("Erro ao comentar:", error);
      return res.status(500).json({ error: "Erro ao publicar comentário." });
    }
  }

  /** PATCH /comentarios/:id — corpo { texto?, resolvido? } */
  async update(req: Request, res: Response) {
    try {
      const comment = await findComment(req);
      if (!comment) return res.status(404).json({ error: "Comentário não encontrado." });

      const isAuthor = comment.autorId === req.userId;
      const data: Prisma.ComentarioConteudoUncheckedUpdateInput = {};

      if (req.body?.texto !== undefined) {
        if (!isAuthor || comment.tipo !== "COMENTARIO") {
          return res.status(403).json({ error: "Só quem escreveu pode editar o comentário.", code: "ROLE_FORBIDDEN" });
        }
        const parsed = parseText(req.body.texto);
        if ("error" in parsed) return res.status(400).json({ error: parsed.error });
        data.texto = parsed.texto;
      }

      if (req.body?.resolvido !== undefined) {
        if (typeof req.body.resolvido !== "boolean") {
          return res.status(400).json({ error: "\"resolvido\" deve ser verdadeiro ou falso." });
        }
        const canResolve = isAuthor || comment.conteudo.autorId === req.userId || isManager(req.workspaceRole);
        if (!canResolve) {
          return res.status(403).json({ error: "Você não pode resolver este comentário.", code: "ROLE_FORBIDDEN" });
        }
        data.resolvido = req.body.resolvido;
        data.resolvidoPorId = req.body.resolvido ? req.userId : null;
        data.resolvidoEm = req.body.resolvido ? new Date() : null;
      }

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: "Informe o texto ou o status de resolvido." });
      }

      const updated = await prisma.comentarioConteudo.update({ where: { id: comment.id }, data, select: commentSelect });

      if (data.resolvido !== undefined) {
        await logEvent({
          userId: req.userId,
          acao: data.resolvido ? "COMMENT_RESOLVED" : "COMMENT_REOPENED",
          req,
          entidade: "conteudo",
          entidadeId: comment.conteudo.id,
          detalhes: { comentarioId: comment.id },
        });
      }

      return res.json({ comentario: serializeComment(req, updated, comment.conteudo.autorId) });
    } catch (error: any) {
      console.error("Erro ao atualizar comentário:", error);
      return res.status(500).json({ error: "Erro ao atualizar comentário." });
    }
  }

  /** DELETE /comentarios/:id — quem escreveu ou um gestor */
  async delete(req: Request, res: Response) {
    try {
      const comment = await findComment(req);
      if (!comment) return res.status(404).json({ error: "Comentário não encontrado." });

      if (comment.autorId !== req.userId && !isManager(req.workspaceRole)) {
        return res.status(403).json({ error: "Só quem escreveu ou um gestor pode excluir.", code: "ROLE_FORBIDDEN" });
      }

      await prisma.comentarioConteudo.delete({ where: { id: comment.id } });
      return res.status(204).send();
    } catch (error: any) {
      console.error("Erro ao excluir comentário:", error);
      return res.status(500).json({ error: "Erro ao excluir comentário." });
    }
  }

  /**
   * POST /conteudos/:id/aprovar-roteiro — corpo { texto? } (DONO/GESTOR, conteúdo em Roteiro).
   * Registra a aprovação, deixa um comentário no histórico e leva o conteúdo para Gravação.
   * Pedidos de ajuste ainda abertos são marcados como resolvidos pela aprovação.
   */
  async approveScript(req: Request, res: Response) {
    try {
      if (!canReviewScript(req.workspaceRole)) {
        return res.status(403).json({ error: "Só gestores aprovam roteiros.", code: "ROLE_FORBIDDEN" });
      }

      const content = await findContent(req);
      if (!content) return res.status(404).json({ error: "Conteúdo não encontrado." });
      if (content.etapa !== "ROTEIRO") {
        return res.status(409).json({ error: "Só é possível aprovar conteúdos na etapa Roteiro.", code: "INVALID_STAGE" });
      }

      // Observação opcional da aprovação
      let note = "Roteiro aprovado.";
      const rawNote = req.body?.texto;
      if (typeof rawNote === "string" && rawNote.trim().length > 0) {
        const parsed = parseText(rawNote);
        if ("error" in parsed) return res.status(400).json({ error: parsed.error });
        note = parsed.texto;
      }
      const now = new Date();

      await prisma.$transaction(async (tx) => {
        await tx.comentarioConteudo.updateMany({
          where: { conteudoId: content.id, tipo: "AJUSTE", resolvido: false },
          data: { resolvido: true, resolvidoPorId: req.userId, resolvidoEm: now },
        });
        await tx.comentarioConteudo.create({
          data: {
            conteudoId: content.id,
            workspaceId: req.workspaceId,
            autorId: req.userId,
            texto: note,
            tipo: "APROVACAO",
            etapa: "ROTEIRO",
            resolvido: true,
          },
        });
        await tx.conteudo.update({
          where: { id: content.id },
          data: {
            etapa: "GRAVACAO",
            posicao: await nextPosition(tx, req.workspaceId, "GRAVACAO"),
            roteiroAprovadoEm: now,
            roteiroAprovadoPorId: req.userId,
          },
        });
      });

      await logEvent({
        userId: req.userId,
        acao: "SCRIPT_APPROVED",
        req,
        entidade: "conteudo",
        entidadeId: content.id,
        detalhes: { via: "revisao", para: "GRAVACAO" },
      });

      return res.json({ message: "Roteiro aprovado. O conteúdo seguiu para a gravação." });
    } catch (error: any) {
      console.error("Erro ao aprovar roteiro:", error);
      return res.status(500).json({ error: "Erro ao aprovar roteiro." });
    }
  }

  /**
   * POST /conteudos/:id/solicitar-ajustes — corpo { texto } (DONO/GESTOR, conteúdo em Roteiro ou Gravação).
   * Deixa o pedido como comentário aberto, desfaz a aprovação e devolve o conteúdo para Roteiro.
   */
  async requestChanges(req: Request, res: Response) {
    try {
      if (!canReviewScript(req.workspaceRole)) {
        return res.status(403).json({ error: "Só gestores pedem ajustes no roteiro.", code: "ROLE_FORBIDDEN" });
      }

      const content = await findContent(req);
      if (!content) return res.status(404).json({ error: "Conteúdo não encontrado." });
      if (content.etapa !== "ROTEIRO" && content.etapa !== "GRAVACAO") {
        return res.status(409).json({
          error: "Ajustes de roteiro só podem ser pedidos nas etapas Roteiro ou Gravação.",
          code: "INVALID_STAGE",
        });
      }

      if (typeof req.body?.texto !== "string" || req.body.texto.trim().length === 0) {
        return res.status(400).json({ error: "Descreva o que precisa ser ajustado." });
      }
      const parsed = parseText(req.body.texto);
      if ("error" in parsed) return res.status(400).json({ error: parsed.error });

      await prisma.$transaction(async (tx) => {
        await tx.comentarioConteudo.create({
          data: {
            conteudoId: content.id,
            workspaceId: req.workspaceId,
            autorId: req.userId,
            texto: parsed.texto,
            tipo: "AJUSTE",
            etapa: content.etapa,
          },
        });
        await tx.conteudo.update({
          where: { id: content.id },
          data: {
            roteiroAprovadoEm: null,
            roteiroAprovadoPorId: null,
            ...(content.etapa !== "ROTEIRO"
              ? { etapa: "ROTEIRO", posicao: await nextPosition(tx, req.workspaceId, "ROTEIRO") }
              : {}),
          },
        });
      });

      await logEvent({
        userId: req.userId,
        acao: "SCRIPT_CHANGES_REQUESTED",
        req,
        entidade: "conteudo",
        entidadeId: content.id,
        detalhes: { etapaAnterior: content.etapa },
      });

      return res.json({ message: "Pedido de ajustes enviado. O conteúdo voltou para a etapa Roteiro." });
    } catch (error: any) {
      console.error("Erro ao pedir ajustes:", error);
      return res.status(500).json({ error: "Erro ao pedir ajustes." });
    }
  }
}
