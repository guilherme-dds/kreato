import type { Request, Response } from "express";
import type { Prisma } from "../generated/prisma/client.js";
import prisma from "../utils/prisma.js";
import { logEvent } from "../utils/logger.js";
import { getPlanLimits, isWithinLimit, rejectPlanLimit } from "../utils/plans.js";
import { parsePositiveInt, queryString } from "../utils/request.js";
import { canManageWorkspace } from "../utils/workspaces.js";
import {
  IDEA_STATUSES,
  PLATFORMS,
  normalizeTags,
  optionalText,
  parseEnum,
  readTags,
  type IdeaStatus,
  type Platform,
} from "../utils/content.js";

const TITLE_MAX_LENGTH = 150;
const HOOK_MAX_LENGTH = 2000;
const DESCRIPTION_MAX_LENGTH = 5000;
const CAPTION_MAX_LENGTH = 2200; // limite de legenda do Instagram

const ideaSelect = {
  id: true,
  titulo: true,
  gancho: true,
  descricao: true,
  legenda: true,
  plataforma: true,
  tags: true,
  status: true,
  criadoEm: true,
  atualizadoEm: true,
  autor: { select: { id: true, nome: true, fotoPerfil: true } },
} satisfies Prisma.IdeiaSelect;

type IdeaRecord = Prisma.IdeiaGetPayload<{ select: typeof ideaSelect }>;

interface IdeaInput {
  titulo?: string;
  gancho?: string | null;
  descricao?: string | null;
  legenda?: string | null;
  plataforma?: Platform | null;
  tags?: string[];
  status?: IdeaStatus;
}

function serializeIdea(idea: IdeaRecord) {
  return { ...idea, tags: readTags(idea.tags) };
}

/**
 * Valida o corpo da requisição. Em atualizações parciais, campos ausentes são ignorados.
 */
function parseIdeaInput(body: unknown, partial: boolean): { data: IdeaInput } | { error: string } {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const data: IdeaInput = {};

  if (input.titulo !== undefined || !partial) {
    const titulo = typeof input.titulo === "string" ? input.titulo.trim() : "";
    if (titulo.length === 0 || titulo.length > TITLE_MAX_LENGTH) {
      return { error: `O título é obrigatório e deve ter até ${TITLE_MAX_LENGTH} caracteres.` };
    }
    data.titulo = titulo;
  }

  const gancho = optionalText(input.gancho, HOOK_MAX_LENGTH);
  if (gancho !== undefined) data.gancho = gancho;

  const descricao = optionalText(input.descricao, DESCRIPTION_MAX_LENGTH);
  if (descricao !== undefined) data.descricao = descricao;

  const legenda = optionalText(input.legenda, CAPTION_MAX_LENGTH);
  if (legenda !== undefined) data.legenda = legenda;

  if (input.plataforma !== undefined) {
    if (input.plataforma === null || input.plataforma === "") {
      data.plataforma = null;
    } else {
      const plataforma = parseEnum(PLATFORMS, input.plataforma);
      if (!plataforma) return { error: `Plataforma inválida. Use: ${PLATFORMS.join(", ")}.` };
      data.plataforma = plataforma;
    }
  }

  if (input.tags !== undefined) {
    data.tags = normalizeTags(input.tags);
  }

  if (input.status !== undefined) {
    const status = parseEnum(IDEA_STATUSES, input.status);
    if (!status) return { error: `Status inválido. Use: ${IDEA_STATUSES.join(", ")}.` };
    data.status = status;
  }

  return { data };
}

function countActiveIdeas(workspaceId: string) {
  return prisma.ideia.count({ where: { workspaceId, status: { not: "ARQUIVADA" } } });
}

function rejectIdeaLimit(req: Request, res: Response, usage: number) {
  const limit = getPlanLimits(req.workspacePlan).ideias;
  return rejectPlanLimit(
    req,
    res,
    "ideias",
    usage,
    `Você atingiu o limite de ${limit} ideias ativas do seu plano. Arquive ideias antigas ou faça upgrade.`,
  );
}

export class IdeaController {
  /**
   * Lista as ideias do workspace com filtros (status, plataforma, tag, busca) e o uso do plano.
   * Sem filtro de status, retorna apenas as ideias não arquivadas.
   */
  async index(req: Request, res: Response) {
    try {
      const where: Prisma.IdeiaWhereInput = { workspaceId: req.workspaceId };

      const status = parseEnum(IDEA_STATUSES, queryString(req.query.status));
      where.status = status ?? { not: "ARQUIVADA" };

      const plataforma = parseEnum(PLATFORMS, queryString(req.query.plataforma));
      if (plataforma) where.plataforma = plataforma;

      const tag = normalizeTags(queryString(req.query.tag) ?? "")[0];
      if (tag) where.tags = { array_contains: [tag] };

      const busca = queryString(req.query.busca);
      if (busca) {
        where.OR = [
          { titulo: { contains: busca } },
          { gancho: { contains: busca } },
          { descricao: { contains: busca } },
        ];
      }

      const [ideias, ideiasAtivas] = await Promise.all([
        prisma.ideia.findMany({ where, select: ideaSelect, orderBy: { atualizadoEm: "desc" } }),
        countActiveIdeas(req.workspaceId),
      ]);

      const limite = getPlanLimits(req.workspacePlan).ideias;

      return res.json({
        ideias: ideias.map(serializeIdea),
        uso: { ideiasAtivas, limite: Number.isFinite(limite) ? limite : null },
      });
    } catch (error: any) {
      console.error("Erro ao listar ideias:", error);
      return res.status(500).json({ error: "Erro ao listar ideias." });
    }
  }

  async show(req: Request, res: Response) {
    try {
      const id = parsePositiveInt(req.params.id);
      if (!id) return res.status(400).json({ error: "ID de ideia inválido." });

      const ideia = await prisma.ideia.findFirst({
        where: { id, workspaceId: req.workspaceId },
        select: ideaSelect,
      });

      if (!ideia) return res.status(404).json({ error: "Ideia não encontrada." });

      return res.json({ ideia: serializeIdea(ideia) });
    } catch (error: any) {
      console.error("Erro ao buscar ideia:", error);
      return res.status(500).json({ error: "Erro ao buscar ideia." });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const parsed = parseIdeaInput(req.body, false);
      if ("error" in parsed) return res.status(400).json({ error: parsed.error });

      const { titulo, tags, status, ...fields } = parsed.data;
      const finalStatus = status ?? "NOVA";

      if (finalStatus !== "ARQUIVADA") {
        const activeIdeas = await countActiveIdeas(req.workspaceId);
        if (!isWithinLimit(req.workspacePlan, "ideias", activeIdeas)) {
          return rejectIdeaLimit(req, res, activeIdeas);
        }
      }

      const ideia = await prisma.ideia.create({
        data: {
          ...fields,
          titulo: titulo as string,
          tags: tags ?? [],
          status: finalStatus,
          workspaceId: req.workspaceId,
          autorId: req.userId,
        },
        select: ideaSelect,
      });

      await logEvent({
        userId: req.userId,
        acao: "IDEA_CREATED",
        req,
        entidade: "ideia",
        entidadeId: ideia.id,
        detalhes: { workspaceId: req.workspaceId, plataforma: ideia.plataforma },
      });

      return res.status(201).json({ ideia: serializeIdea(ideia) });
    } catch (error: any) {
      console.error("Erro ao criar ideia:", error);
      return res.status(500).json({ error: "Erro ao criar ideia." });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const id = parsePositiveInt(req.params.id);
      if (!id) return res.status(400).json({ error: "ID de ideia inválido." });

      const existing = await prisma.ideia.findFirst({
        where: { id, workspaceId: req.workspaceId },
        select: { id: true, status: true },
      });
      if (!existing) return res.status(404).json({ error: "Ideia não encontrada." });

      const parsed = parseIdeaInput(req.body, true);
      if ("error" in parsed) return res.status(400).json({ error: parsed.error });

      const changedFields = Object.keys(parsed.data);
      if (changedFields.length === 0) {
        return res.status(400).json({ error: "Nenhum campo válido para atualizar." });
      }

      // Desarquivar volta a contar no limite de ideias ativas
      const isUnarchiving = existing.status === "ARQUIVADA" && parsed.data.status && parsed.data.status !== "ARQUIVADA";
      if (isUnarchiving) {
        const activeIdeas = await countActiveIdeas(req.workspaceId);
        if (!isWithinLimit(req.workspacePlan, "ideias", activeIdeas)) {
          return rejectIdeaLimit(req, res, activeIdeas);
        }
      }

      const ideia = await prisma.ideia.update({
        where: { id },
        data: parsed.data,
        select: ideaSelect,
      });

      const statusChanged = parsed.data.status && parsed.data.status !== existing.status;
      await logEvent({
        userId: req.userId,
        acao: statusChanged ? "IDEA_STATUS_CHANGED" : "IDEA_UPDATED",
        req,
        entidade: "ideia",
        entidadeId: ideia.id,
        detalhes: statusChanged
          ? { de: existing.status, para: ideia.status, campos: changedFields }
          : { campos: changedFields },
      });

      return res.json({ ideia: serializeIdea(ideia) });
    } catch (error: any) {
      console.error("Erro ao atualizar ideia:", error);
      return res.status(500).json({ error: "Erro ao atualizar ideia." });
    }
  }

  /**
   * Exclui uma ideia (apenas o autor, ou DONO/GESTOR do workspace)
   */
  async delete(req: Request, res: Response) {
    try {
      const id = parsePositiveInt(req.params.id);
      if (!id) return res.status(400).json({ error: "ID de ideia inválido." });

      const existing = await prisma.ideia.findFirst({
        where: { id, workspaceId: req.workspaceId },
        select: { id: true, autorId: true },
      });
      if (!existing) return res.status(404).json({ error: "Ideia não encontrada." });

      if (existing.autorId !== req.userId && !canManageWorkspace(req.workspaceRole)) {
        await logEvent({ userId: req.userId, acao: "PERMISSION_DENIED", req, entidade: "ideia", entidadeId: id });
        return res.status(403).json({ error: "Apenas o autor ou um gestor pode excluir esta ideia." });
      }

      await prisma.ideia.delete({ where: { id } });

      await logEvent({ userId: req.userId, acao: "IDEA_DELETED", req, entidade: "ideia", entidadeId: id });

      return res.status(204).send();
    } catch (error: any) {
      console.error("Erro ao excluir ideia:", error);
      return res.status(500).json({ error: "Erro ao excluir ideia." });
    }
  }
}
