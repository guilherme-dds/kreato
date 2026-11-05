import type { Request, Response } from "express";
import type { Prisma } from "../generated/prisma/client.js";
import prisma from "../utils/prisma.js";
import { logEvent } from "../utils/logger.js";
import { getPlanLimits } from "../utils/plans.js";
import { canManageWorkspace } from "../utils/workspaces.js";
import { parsePositiveInt, queryString } from "../utils/request.js";
import { CONTENT_FORMATS, FINAL_STAGE, INVALID, PLATFORMS, optionalDate, parseEnum } from "../utils/content.js";
import { engagementRate, parseMetricValues, summarize, type MetricValues } from "../utils/metrics.js";

const DAY_MS = 86_400_000;
const DEFAULT_SUMMARY_DAYS = 30;
// Tolerância para relógios levemente adiantados no cliente
const FUTURE_TOLERANCE_MS = 5 * 60_000;

const metricSelect = {
  id: true,
  coletadoEm: true,
  visualizacoes: true,
  curtidas: true,
  comentarios: true,
  compartilhamentos: true,
  salvamentos: true,
  alcance: true,
  seguidoresGanhos: true,
  criadoEm: true,
  registradoPor: { select: { id: true, nome: true } },
} satisfies Prisma.MetricaSelect;

type MetricRecord = Prisma.MetricaGetPayload<{ select: typeof metricSelect }>;

function serializeMetric(metric: MetricRecord) {
  return { ...metric, taxaEngajamento: engagementRate(metric) };
}

/** Início da janela de histórico permitida pelo plano do workspace (null = ilimitado) */
function historyStart(req: Request): { start: Date | null; days: number | null } {
  const days = getPlanLimits(req.workspacePlan).historicoMetricasDias;
  if (!Number.isFinite(days)) return { start: null, days: null };
  return { start: new Date(Date.now() - days * DAY_MS), days };
}

export class MetricController {
  /**
   * GET /conteudos/:id/metricas — evolução das métricas de um conteúdo.
   * No plano Free, fotos mais antigas que a janela de histórico ficam ocultas (e são contadas).
   */
  async index(req: Request, res: Response) {
    try {
      const id = parsePositiveInt(req.params.id);
      if (!id) return res.status(400).json({ error: "ID de conteúdo inválido." });

      const conteudo = await prisma.conteudo.findFirst({
        where: { id, workspaceId: req.workspaceId },
        select: { id: true },
      });
      if (!conteudo) return res.status(404).json({ error: "Conteúdo não encontrado." });

      const { start, days } = historyStart(req);
      const [metricas, ocultas] = await Promise.all([
        prisma.metrica.findMany({
          where: { conteudoId: id, ...(start ? { coletadoEm: { gte: start } } : {}) },
          select: metricSelect,
          orderBy: { coletadoEm: "asc" },
        }),
        start ? prisma.metrica.count({ where: { conteudoId: id, coletadoEm: { lt: start } } }) : Promise.resolve(0),
      ]);

      const serialized = metricas.map(serializeMetric);
      return res.json({
        metricas: serialized,
        ultima: serialized[serialized.length - 1] ?? null,
        historico: { dias: days, ocultas },
      });
    } catch (error: any) {
      console.error("Erro ao listar métricas:", error);
      return res.status(500).json({ error: "Erro ao listar métricas." });
    }
  }

  /**
   * POST /conteudos/:id/metricas — registra os números do conteúdo publicado em um momento.
   * Corpo: { visualizacoes, curtidas, comentarios, compartilhamentos, salvamentos, alcance?, seguidoresGanhos?, coletadoEm? }
   */
  async create(req: Request, res: Response) {
    try {
      const id = parsePositiveInt(req.params.id);
      if (!id) return res.status(400).json({ error: "ID de conteúdo inválido." });

      const conteudo = await prisma.conteudo.findFirst({
        where: { id, workspaceId: req.workspaceId },
        select: { id: true, etapa: true, dataPublicacao: true },
      });
      if (!conteudo) return res.status(404).json({ error: "Conteúdo não encontrado." });

      if (conteudo.etapa !== FINAL_STAGE) {
        return res.status(400).json({
          error: "Registre métricas apenas de conteúdos publicados.",
          code: "CONTENT_NOT_PUBLISHED",
        });
      }

      const parsed = parseMetricValues(req.body);
      if ("error" in parsed) return res.status(400).json({ error: parsed.error });

      const coletadoEm = optionalDate(req.body?.coletadoEm);
      if (coletadoEm === INVALID) return res.status(400).json({ error: "Data de coleta inválida. Use o formato ISO 8601." });
      if (coletadoEm && coletadoEm.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
        return res.status(400).json({ error: "A data de coleta não pode estar no futuro." });
      }

      const metrica = await prisma.metrica.create({
        data: {
          ...parsed.data,
          ...(coletadoEm ? { coletadoEm } : {}),
          conteudoId: id,
          workspaceId: req.workspaceId,
          registradoPorId: req.userId,
        },
        select: metricSelect,
      });

      await logEvent({
        userId: req.userId,
        acao: "METRIC_RECORDED",
        req,
        entidade: "metrica",
        entidadeId: metrica.id,
        detalhes: { conteudoId: id, visualizacoes: metrica.visualizacoes },
      });

      return res.status(201).json({ metrica: serializeMetric(metrica) });
    } catch (error: any) {
      console.error("Erro ao registrar métrica:", error);
      return res.status(500).json({ error: "Erro ao registrar métrica." });
    }
  }

  /** DELETE /metricas/:id — apenas quem registrou, ou DONO/GESTOR do workspace */
  async delete(req: Request, res: Response) {
    try {
      const id = parsePositiveInt(req.params.id);
      if (!id) return res.status(400).json({ error: "ID de métrica inválido." });

      const metrica = await prisma.metrica.findFirst({
        where: { id, workspaceId: req.workspaceId },
        select: { registradoPorId: true, conteudoId: true },
      });
      if (!metrica) return res.status(404).json({ error: "Métrica não encontrada." });

      if (metrica.registradoPorId !== req.userId && !canManageWorkspace(req.workspaceRole)) {
        await logEvent({ userId: req.userId, acao: "PERMISSION_DENIED", req, entidade: "metrica", entidadeId: id });
        return res.status(403).json({ error: "Apenas quem registrou ou um gestor pode excluir esta métrica." });
      }

      await prisma.metrica.delete({ where: { id } });
      await logEvent({
        userId: req.userId,
        acao: "METRIC_DELETED",
        req,
        entidade: "metrica",
        entidadeId: id,
        detalhes: { conteudoId: metrica.conteudoId },
      });

      return res.status(204).send();
    } catch (error: any) {
      console.error("Erro ao excluir métrica:", error);
      return res.status(500).json({ error: "Erro ao excluir métrica." });
    }
  }

  /**
   * GET /metricas/resumo — desempenho dos conteúdos publicados no período (padrão: últimos 30 dias).
   * Filtros: de, ate (dataPublicacao), plataforma, formato.
   * Usa a métrica mais recente de cada conteúdo. No Free, o início do período é limitado ao histórico do plano.
   */
  async summary(req: Request, res: Response) {
    try {
      const de = optionalDate(queryString(req.query.de) ?? undefined);
      const ate = optionalDate(queryString(req.query.ate) ?? undefined);
      if (de === INVALID || ate === INVALID) {
        return res.status(400).json({ error: "Parâmetros de data inválidos. Use o formato ISO 8601." });
      }

      const end = ate ?? new Date();
      let start = de ?? new Date(end.getTime() - DEFAULT_SUMMARY_DAYS * DAY_MS);
      if (start > end) return res.status(400).json({ error: "O início do período deve ser anterior ao fim." });

      const history = historyStart(req);
      const limitadoPeloPlano = history.start !== null && start < history.start;
      if (limitadoPeloPlano && history.start) start = history.start;

      const where: Prisma.ConteudoWhereInput = {
        workspaceId: req.workspaceId,
        etapa: FINAL_STAGE,
        dataPublicacao: { gte: start, lte: end },
      };
      const plataforma = parseEnum(PLATFORMS, queryString(req.query.plataforma));
      if (plataforma) where.plataforma = plataforma;
      const formato = parseEnum(CONTENT_FORMATS, queryString(req.query.formato));
      if (formato) where.formato = formato;

      const conteudos = await prisma.conteudo.findMany({
        where,
        select: {
          id: true,
          titulo: true,
          plataforma: true,
          formato: true,
          dataPublicacao: true,
          urlPublicacao: true,
          metricas: { select: metricSelect, orderBy: { coletadoEm: "desc" }, take: 1 },
        },
      });

      const items = conteudos
        .map(({ metricas, ...conteudo }) => {
          const metrica: MetricValues | null = metricas[0] ?? null;
          return {
            ...conteudo,
            metrica: metricas[0] ? serializeMetric(metricas[0]) : null,
            taxaEngajamento: engagementRate(metrica),
          };
        })
        .sort((a, b) => (b.metrica?.visualizacoes ?? -1) - (a.metrica?.visualizacoes ?? -1));

      return res.json({
        periodo: { de: start, ate: end, limitadoPeloPlano, historicoDias: history.days },
        ...summarize(items),
        conteudos: items,
      });
    } catch (error: any) {
      console.error("Erro ao gerar resumo de métricas:", error);
      return res.status(500).json({ error: "Erro ao gerar resumo de métricas." });
    }
  }
}
