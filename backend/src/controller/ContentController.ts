import type { Request, Response } from "express";
import { countActiveContents } from "../utils/usage.js";
import { Prisma } from "../generated/prisma/client.js";
import prisma from "../utils/prisma.js";
import { logEvent } from "../utils/logger.js";
import { getPlanLimits, isWithinLimit, rejectPlanLimit } from "../utils/plans.js";
import { canManageWorkspace } from "../utils/workspaces.js";
import { parsePositiveInt, queryString } from "../utils/request.js";
import { deleteAssets } from "../utils/minio.js";
import {
  CONTENT_FORMATS,
  CONTENT_STAGES,
  FINAL_STAGE,
  INVALID,
  MAX_HASHTAGS,
  PLATFORMS,
  normalizeTags,
  optionalDate,
  optionalText,
  optionalUrl,
  parseEnum,
  readTags,
  type ContentFormat,
  type ContentStage,
  type Platform,
} from "../utils/content.js";

const TITLE_MAX_LENGTH = 150;
const SCRIPT_MAX_LENGTH = 50_000;
const CAPTION_MAX_LENGTH = 2200; // limite de legenda do Instagram
const URL_MAX_LENGTH = 500;

/** Etapas em que uma ideia pode entrar no pipeline ao ser convertida */
const CONVERTIBLE_STAGES: readonly ContentStage[] = ["IDEIA", "ROTEIRO", "GRAVACAO", "EDICAO"];

type Tx = Prisma.TransactionClient;

// A listagem (kanban/calendário) não carrega roteiro e legenda, que podem ser longos
const listSelect = {
  id: true,
  titulo: true,
  etapa: true,
  posicao: true,
  plataforma: true,
  formato: true,
  hashtags: true,
  dataPublicacao: true,
  urlPublicacao: true,
  ideiaId: true,
  criadoEm: true,
  atualizadoEm: true,
  autor: { select: { id: true, nome: true, fotoPerfil: true } },
} satisfies Prisma.ConteudoSelect;

const detailSelect = {
  ...listSelect,
  roteiro: true,
  legenda: true,
  ideia: { select: { id: true, titulo: true } },
} satisfies Prisma.ConteudoSelect;

function serializeContent<T extends { hashtags: Prisma.JsonValue }>(content: T) {
  return { ...content, hashtags: readTags(content.hashtags) };
}

interface ContentFields {
  titulo?: string;
  roteiro?: string | null;
  legenda?: string | null;
  hashtags?: string[];
  plataforma?: Platform | null;
  formato?: ContentFormat | null;
  dataPublicacao?: Date | null;
  urlPublicacao?: string | null;
}

type ParseResult<T> = { data: T } | { error: string; code?: string };

function parseNullableEnum<T extends string>(
  values: readonly T[],
  value: unknown,
  label: string,
): { value: T | null | undefined } | { error: string } {
  if (value === undefined) return { value: undefined };
  if (value === null || value === "") return { value: null };
  const parsed = parseEnum(values, value);
  return parsed ? { value: parsed } : { error: `${label} inválido(a). Use: ${values.join(", ")}.` };
}

/**
 * Valida os campos editáveis do conteúdo. A etapa não faz parte deste corpo:
 * ela muda pelo endpoint dedicado, que também cuida da ordem no kanban.
 */
function parseContentFields(body: unknown, partial: boolean): ParseResult<ContentFields> {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const data: ContentFields = {};

  if (input.titulo !== undefined || !partial) {
    const titulo = typeof input.titulo === "string" ? input.titulo.trim() : "";
    if (titulo.length === 0 || titulo.length > TITLE_MAX_LENGTH) {
      return { error: `O título é obrigatório e deve ter até ${TITLE_MAX_LENGTH} caracteres.` };
    }
    data.titulo = titulo;
  }

  const roteiro = optionalText(input.roteiro, SCRIPT_MAX_LENGTH);
  if (roteiro !== undefined) data.roteiro = roteiro;

  const legenda = optionalText(input.legenda, CAPTION_MAX_LENGTH);
  if (legenda !== undefined) data.legenda = legenda;

  if (input.hashtags !== undefined) data.hashtags = normalizeTags(input.hashtags, MAX_HASHTAGS);

  const plataforma = parseNullableEnum(PLATFORMS, input.plataforma, "Plataforma");
  if ("error" in plataforma) return plataforma;
  if (plataforma.value !== undefined) data.plataforma = plataforma.value;

  const formato = parseNullableEnum(CONTENT_FORMATS, input.formato, "Formato");
  if ("error" in formato) return formato;
  if (formato.value !== undefined) data.formato = formato.value;

  const dataPublicacao = optionalDate(input.dataPublicacao);
  if (dataPublicacao === INVALID) return { error: "Data de publicação inválida. Use o formato ISO 8601." };
  if (dataPublicacao !== undefined) data.dataPublicacao = dataPublicacao;

  const urlPublicacao = optionalUrl(input.urlPublicacao, URL_MAX_LENGTH);
  if (urlPublicacao === INVALID) return { error: "URL de publicação inválida. Use um link http(s)." };
  if (urlPublicacao !== undefined) data.urlPublicacao = urlPublicacao;

  return { data };
}

/**
 * Regras por etapa: agendar exige data de publicação; ao publicar sem data, assume agora.
 * Retorna a data de publicação final.
 */
function resolvePublicationDate(
  etapa: ContentStage,
  dataPublicacao: Date | null,
): { data: Date | null } | { error: string; code: string } {
  if (etapa === "AGENDADO" && !dataPublicacao) {
    return { error: "Defina a data de publicação para agendar o conteúdo.", code: "SCHEDULE_DATE_REQUIRED" };
  }
  if (etapa === FINAL_STAGE && !dataPublicacao) return { data: new Date() };
  return { data: dataPublicacao };
}

function badRequest(res: Response, parsed: { error: string; code?: string }) {
  return res.status(400).json(parsed.code ? { error: parsed.error, code: parsed.code } : { error: parsed.error });
}

function rejectContentLimit(req: Request, res: Response, usage: number) {
  const limit = getPlanLimits(req.workspacePlan).conteudosAtivos;
  return rejectPlanLimit(
    req,
    res,
    "conteudosAtivos",
    usage,
    `Você atingiu o limite de ${limit} conteúdos em produção do seu plano. Publique ou exclua conteúdos, ou faça upgrade.`,
  );
}

/** Próxima posição livre no fim da coluna */
async function nextPosition(tx: Tx, workspaceId: string, etapa: ContentStage): Promise<number> {
  const result = await tx.conteudo.aggregate({ where: { workspaceId, etapa }, _max: { posicao: true } });
  return (result._max.posicao ?? -1) + 1;
}

/**
 * Reposiciona os demais cards da coluna para abrir espaço no índice desejado.
 * Retorna o índice efetivo (limitado ao tamanho da coluna).
 */
async function makeRoomAt(tx: Tx, workspaceId: string, etapa: ContentStage, movingId: number, index: number) {
  const siblings = await tx.conteudo.findMany({
    where: { workspaceId, etapa, id: { not: movingId } },
    select: { id: true, posicao: true },
    orderBy: [{ posicao: "asc" }, { id: "asc" }],
  });

  const target = Math.min(Math.max(index, 0), siblings.length);
  for (const [i, sibling] of siblings.entries()) {
    const posicao = i < target ? i : i + 1;
    if (sibling.posicao !== posicao) {
      await tx.conteudo.update({ where: { id: sibling.id }, data: { posicao } });
    }
  }
  return target;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export class ContentController {
  /**
   * Lista os conteúdos do workspace (kanban e calendário).
   * Filtros: etapa (uma ou várias separadas por vírgula), plataforma, formato, busca,
   * de/ate (intervalo de dataPublicacao).
   */
  async index(req: Request, res: Response) {
    try {
      const where: Prisma.ConteudoWhereInput = { workspaceId: req.workspaceId };

      const etapas = (queryString(req.query.etapa) ?? "")
        .split(",")
        .map((value) => parseEnum(CONTENT_STAGES, value))
        .filter((value): value is ContentStage => value !== null);
      if (etapas.length > 0) where.etapa = { in: etapas };

      const plataforma = parseEnum(PLATFORMS, queryString(req.query.plataforma));
      if (plataforma) where.plataforma = plataforma;

      const formato = parseEnum(CONTENT_FORMATS, queryString(req.query.formato));
      if (formato) where.formato = formato;

      const de = optionalDate(queryString(req.query.de) ?? undefined);
      const ate = optionalDate(queryString(req.query.ate) ?? undefined);
      if (de === INVALID || ate === INVALID) {
        return res.status(400).json({ error: "Parâmetros de data inválidos. Use o formato ISO 8601." });
      }
      if (de || ate) {
        where.dataPublicacao = { ...(de ? { gte: de } : {}), ...(ate ? { lte: ate } : {}) };
      }

      const busca = queryString(req.query.busca);
      if (busca) {
        where.OR = [{ titulo: { contains: busca } }, { roteiro: { contains: busca } }, { legenda: { contains: busca } }];
      }

      const [conteudos, conteudosAtivos] = await Promise.all([
        prisma.conteudo.findMany({ where, select: listSelect, orderBy: [{ posicao: "asc" }, { id: "asc" }] }),
        countActiveContents(req.workspaceId),
      ]);

      const limite = getPlanLimits(req.workspacePlan).conteudosAtivos;

      return res.json({
        conteudos: conteudos.map(serializeContent),
        uso: { conteudosAtivos, limite: Number.isFinite(limite) ? limite : null },
      });
    } catch (error: any) {
      console.error("Erro ao listar conteúdos:", error);
      return res.status(500).json({ error: "Erro ao listar conteúdos." });
    }
  }

  async show(req: Request, res: Response) {
    try {
      const id = parsePositiveInt(req.params.id);
      if (!id) return res.status(400).json({ error: "ID de conteúdo inválido." });

      const conteudo = await prisma.conteudo.findFirst({
        where: { id, workspaceId: req.workspaceId },
        select: detailSelect,
      });
      if (!conteudo) return res.status(404).json({ error: "Conteúdo não encontrado." });

      return res.json({ conteudo: serializeContent(conteudo) });
    } catch (error: any) {
      console.error("Erro ao buscar conteúdo:", error);
      return res.status(500).json({ error: "Erro ao buscar conteúdo." });
    }
  }

  /** Cria um conteúdo direto no pipeline (etapa opcional, padrão IDEIA), no fim da coluna */
  async create(req: Request, res: Response) {
    try {
      const parsed = parseContentFields(req.body, false);
      if ("error" in parsed) return badRequest(res, parsed);

      const rawStage = req.body?.etapa;
      const etapa = rawStage === undefined ? "IDEIA" : parseEnum(CONTENT_STAGES, rawStage);
      if (!etapa) return res.status(400).json({ error: `Etapa inválida. Use: ${CONTENT_STAGES.join(", ")}.` });

      const publication = resolvePublicationDate(etapa, parsed.data.dataPublicacao ?? null);
      if ("error" in publication) return badRequest(res, publication);

      if (etapa !== FINAL_STAGE) {
        const active = await countActiveContents(req.workspaceId);
        if (!isWithinLimit(req.workspacePlan, "conteudosAtivos", active)) return rejectContentLimit(req, res, active);
      }

      const { titulo, hashtags, ...fields } = parsed.data;
      const conteudo = await prisma.$transaction(async (tx) =>
        tx.conteudo.create({
          data: {
            ...fields,
            titulo: titulo as string,
            hashtags: hashtags ?? [],
            etapa,
            dataPublicacao: publication.data,
            posicao: await nextPosition(tx, req.workspaceId, etapa),
            workspaceId: req.workspaceId,
            autorId: req.userId,
          },
          select: detailSelect,
        }),
      );

      await logEvent({
        userId: req.userId,
        acao: "CONTENT_CREATED",
        req,
        entidade: "conteudo",
        entidadeId: conteudo.id,
        detalhes: { workspaceId: req.workspaceId, etapa, plataforma: conteudo.plataforma, formato: conteudo.formato },
      });

      return res.status(201).json({ conteudo: serializeContent(conteudo) });
    } catch (error: any) {
      console.error("Erro ao criar conteúdo:", error);
      return res.status(500).json({ error: "Erro ao criar conteúdo." });
    }
  }

  /** Atualização parcial dos campos (roteiro, legenda, datas...). Não altera a etapa. */
  async update(req: Request, res: Response) {
    try {
      const id = parsePositiveInt(req.params.id);
      if (!id) return res.status(400).json({ error: "ID de conteúdo inválido." });

      if (req.body?.etapa !== undefined || req.body?.posicao !== undefined) {
        return res.status(400).json({ error: "Use PATCH /conteudos/:id/etapa para mover o conteúdo no pipeline." });
      }

      const existing = await prisma.conteudo.findFirst({
        where: { id, workspaceId: req.workspaceId },
        select: { etapa: true, dataPublicacao: true },
      });
      if (!existing) return res.status(404).json({ error: "Conteúdo não encontrado." });

      const parsed = parseContentFields(req.body, true);
      if ("error" in parsed) return badRequest(res, parsed);

      const changedFields = Object.keys(parsed.data);
      if (changedFields.length === 0) {
        return res.status(400).json({ error: "Nenhum campo válido para atualizar." });
      }

      if (parsed.data.dataPublicacao !== undefined) {
        const publication = resolvePublicationDate(existing.etapa as ContentStage, parsed.data.dataPublicacao);
        if ("error" in publication) return badRequest(res, publication);
        parsed.data.dataPublicacao = publication.data;
      }

      const conteudo = await prisma.conteudo.update({ where: { id }, data: parsed.data, select: detailSelect });

      await logEvent({
        userId: req.userId,
        acao: "CONTENT_UPDATED",
        req,
        entidade: "conteudo",
        entidadeId: id,
        detalhes: { campos: changedFields },
      });

      return res.json({ conteudo: serializeContent(conteudo) });
    } catch (error: any) {
      console.error("Erro ao atualizar conteúdo:", error);
      return res.status(500).json({ error: "Erro ao atualizar conteúdo." });
    }
  }

  /**
   * Move o conteúdo no pipeline (drag-and-drop do kanban).
   * Corpo: { etapa, posicao?, dataPublicacao?, urlPublicacao? }
   * - posicao: índice na coluna de destino; sem ele, o card vai para o fim (ou fica onde está na mesma coluna)
   * - agendar exige dataPublicacao (enviada agora ou já salva)
   */
  async updateStage(req: Request, res: Response) {
    try {
      const id = parsePositiveInt(req.params.id);
      if (!id) return res.status(400).json({ error: "ID de conteúdo inválido." });

      const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;

      const etapa = parseEnum(CONTENT_STAGES, body.etapa);
      if (!etapa) return res.status(400).json({ error: `Etapa inválida. Use: ${CONTENT_STAGES.join(", ")}.` });

      let posicao: number | undefined;
      if (body.posicao !== undefined) {
        if (typeof body.posicao !== "number" || !Number.isInteger(body.posicao) || body.posicao < 0) {
          return res.status(400).json({ error: "A posição deve ser um inteiro maior ou igual a zero." });
        }
        posicao = body.posicao;
      }

      const dataPublicacao = optionalDate(body.dataPublicacao);
      if (dataPublicacao === INVALID) {
        return res.status(400).json({ error: "Data de publicação inválida. Use o formato ISO 8601." });
      }
      const urlPublicacao = optionalUrl(body.urlPublicacao, URL_MAX_LENGTH);
      if (urlPublicacao === INVALID) {
        return res.status(400).json({ error: "URL de publicação inválida. Use um link http(s)." });
      }

      const existing = await prisma.conteudo.findFirst({
        where: { id, workspaceId: req.workspaceId },
        select: { etapa: true, posicao: true, dataPublicacao: true },
      });
      if (!existing) return res.status(404).json({ error: "Conteúdo não encontrado." });

      const previousStage = existing.etapa as ContentStage;
      const stageChanged = previousStage !== etapa;

      // Tirar um conteúdo de "Publicado" o devolve ao pipeline ativo, que tem limite no plano Free
      if (previousStage === FINAL_STAGE && etapa !== FINAL_STAGE) {
        const active = await countActiveContents(req.workspaceId);
        if (!isWithinLimit(req.workspacePlan, "conteudosAtivos", active)) return rejectContentLimit(req, res, active);
      }

      const publication = resolvePublicationDate(
        etapa,
        dataPublicacao !== undefined ? dataPublicacao : existing.dataPublicacao,
      );
      if ("error" in publication) return badRequest(res, publication);

      const conteudo = await prisma.$transaction(async (tx) => {
        let finalPosition = existing.posicao;
        if (posicao !== undefined) {
          finalPosition = await makeRoomAt(tx, req.workspaceId, etapa, id, posicao);
        } else if (stageChanged) {
          finalPosition = await nextPosition(tx, req.workspaceId, etapa);
        }

        return tx.conteudo.update({
          where: { id },
          data: {
            etapa,
            posicao: finalPosition,
            dataPublicacao: publication.data,
            ...(urlPublicacao !== undefined ? { urlPublicacao } : {}),
          },
          select: detailSelect,
        });
      });

      // Reordenar dentro da mesma coluna é frequente e não gera evento de auditoria
      if (stageChanged) {
        await logEvent({
          userId: req.userId,
          acao: "CONTENT_STAGE_CHANGED",
          req,
          entidade: "conteudo",
          entidadeId: id,
          detalhes: { de: previousStage, para: etapa },
        });
      }

      return res.json({ conteudo: serializeContent(conteudo) });
    } catch (error: any) {
      console.error("Erro ao mover conteúdo:", error);
      return res.status(500).json({ error: "Erro ao mover conteúdo." });
    }
  }

  /** Exclui um conteúdo (apenas o autor, ou DONO/GESTOR do workspace) */
  async delete(req: Request, res: Response) {
    try {
      const id = parsePositiveInt(req.params.id);
      if (!id) return res.status(400).json({ error: "ID de conteúdo inválido." });

      const existing = await prisma.conteudo.findFirst({
        where: { id, workspaceId: req.workspaceId },
        select: { autorId: true, etapa: true },
      });
      if (!existing) return res.status(404).json({ error: "Conteúdo não encontrado." });

      if (existing.autorId !== req.userId && !canManageWorkspace(req.workspaceRole)) {
        await logEvent({ userId: req.userId, acao: "PERMISSION_DENIED", req, entidade: "conteudo", entidadeId: id });
        return res.status(403).json({ error: "Apenas o autor ou um gestor pode excluir este conteúdo." });
      }

      // Os registros de anexo caem em cascata; os arquivos no MinIO precisam ser removidos à parte
      const anexos = await prisma.anexo.findMany({ where: { conteudoId: id }, select: { chave: true } });
      await prisma.conteudo.delete({ where: { id } });
      await deleteAssets(anexos.map((anexo) => anexo.chave));

      await logEvent({
        userId: req.userId,
        acao: "CONTENT_DELETED",
        req,
        entidade: "conteudo",
        entidadeId: id,
        detalhes: { etapa: existing.etapa },
      });

      return res.status(204).send();
    } catch (error: any) {
      console.error("Erro ao excluir conteúdo:", error);
      return res.status(500).json({ error: "Erro ao excluir conteúdo." });
    }
  }

  /**
   * POST /ideias/:id/converter — leva uma ideia para o pipeline.
   * Copia título, plataforma, legenda e tags (como hashtags); gancho e descrição viram o rascunho do roteiro.
   * Corpo opcional: { etapa } (padrão ROTEIRO). Uma ideia só pode ser convertida uma vez.
   */
  async convertIdea(req: Request, res: Response) {
    try {
      const ideaId = parsePositiveInt(req.params.id);
      if (!ideaId) return res.status(400).json({ error: "ID de ideia inválido." });

      const rawStage = req.body?.etapa;
      const etapa = rawStage === undefined ? "ROTEIRO" : parseEnum(CONVERTIBLE_STAGES, rawStage);
      if (!etapa) {
        return res.status(400).json({ error: `Etapa inválida para conversão. Use: ${CONVERTIBLE_STAGES.join(", ")}.` });
      }

      const ideia = await prisma.ideia.findFirst({
        where: { id: ideaId, workspaceId: req.workspaceId },
        select: {
          titulo: true,
          gancho: true,
          descricao: true,
          legenda: true,
          plataforma: true,
          tags: true,
          status: true,
          conteudo: { select: { id: true } },
        },
      });
      if (!ideia) return res.status(404).json({ error: "Ideia não encontrada." });

      const alreadyConverted = (conteudoId: number | null) =>
        res.status(409).json({
          error: "Esta ideia já foi levada para o pipeline.",
          code: "IDEA_ALREADY_CONVERTED",
          conteudoId,
        });
      if (ideia.conteudo) return alreadyConverted(ideia.conteudo.id);

      const active = await countActiveContents(req.workspaceId);
      if (!isWithinLimit(req.workspacePlan, "conteudosAtivos", active)) return rejectContentLimit(req, res, active);

      const roteiro = [ideia.gancho && `GANCHO\n${ideia.gancho}`, ideia.descricao].filter(Boolean).join("\n\n");

      let conteudo;
      try {
        conteudo = await prisma.$transaction(async (tx) => {
          const created = await tx.conteudo.create({
            data: {
              titulo: ideia.titulo,
              roteiro: roteiro || null,
              legenda: ideia.legenda,
              hashtags: readTags(ideia.tags),
              plataforma: ideia.plataforma,
              etapa,
              posicao: await nextPosition(tx, req.workspaceId, etapa),
              ideiaId: ideaId,
              workspaceId: req.workspaceId,
              autorId: req.userId,
            },
            select: detailSelect,
          });

          // Ideias arquivadas continuam arquivadas para não voltarem a contar no limite de ideias
          if (ideia.status === "NOVA") {
            await tx.ideia.update({ where: { id: ideaId }, data: { status: "EM_DESENVOLVIMENTO" } });
          }
          return created;
        });
      } catch (error) {
        // Duas conversões simultâneas da mesma ideia: a restrição única em ideiaId barra a segunda
        if (isUniqueViolation(error)) return alreadyConverted(null);
        throw error;
      }

      await logEvent({
        userId: req.userId,
        acao: "IDEA_CONVERTED",
        req,
        entidade: "conteudo",
        entidadeId: conteudo.id,
        detalhes: { ideiaId: ideaId, etapa },
      });

      return res.status(201).json({ conteudo: serializeContent(conteudo) });
    } catch (error: any) {
      console.error("Erro ao converter ideia:", error);
      return res.status(500).json({ error: "Erro ao converter ideia em conteúdo." });
    }
  }
}
