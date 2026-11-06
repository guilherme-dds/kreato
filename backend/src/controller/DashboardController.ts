import type { Request, Response } from "express";
import type { Prisma } from "../generated/prisma/client.js";
import prisma from "../utils/prisma.js";
import { canManageWorkspace } from "../utils/workspaces.js";
import { queryString } from "../utils/request.js";
import { CONTENT_STAGES, FINAL_STAGE } from "../utils/content.js";
import { engagementRate, summarize } from "../utils/metrics.js";
import { STREAK_LOOKBACK_WEEKS, WEEK_MS, resolveWeekStart, weeklyGoalProgress } from "../utils/goals.js";

const DAY_MS = 86_400_000;
const AGENDA_DAYS = 7;
const AGENDA_LIMIT = 5;
const PERFORMANCE_DAYS = 30;
const RECENT_IDEAS = 3;

const agendaSelect = {
  id: true,
  titulo: true,
  etapa: true,
  plataforma: true,
  formato: true,
  dataPublicacao: true,
} satisfies Prisma.ConteudoSelect;

const latestMetricSelect = {
  visualizacoes: true,
  curtidas: true,
  comentarios: true,
  compartilhamentos: true,
  salvamentos: true,
  alcance: true,
  seguidoresGanhos: true,
} satisfies Prisma.MetricaSelect;

export class DashboardController {
  /**
   * GET /dashboard?inicioSemana=ISO — visão geral do workspace atual:
   * meta semanal e sequência, pipeline por etapa, agenda (atrasados e próximos 7 dias),
   * ideias novas e desempenho dos últimos 30 dias.
   */
  async show(req: Request, res: Response) {
    try {
      const workspaceId = req.workspaceId;
      const now = new Date();
      const weekStart = resolveWeekStart(queryString(req.query.inicioSemana), now);
      const notPublished = { workspaceId, etapa: { not: FINAL_STAGE } } satisfies Prisma.ConteudoWhereInput;

      const [
        workspace,
        publishedDates,
        stageGroups,
        overdue,
        overdueCount,
        upcoming,
        newIdeasCount,
        recentIdeas,
        recentPublished,
      ] = await Promise.all([
        prisma.workspace.findUnique({ where: { id: workspaceId }, select: { metaSemanal: true } }),
        prisma.conteudo.findMany({
          where: {
            workspaceId,
            etapa: FINAL_STAGE,
            dataPublicacao: {
              gte: new Date(weekStart.getTime() - (STREAK_LOOKBACK_WEEKS - 1) * WEEK_MS),
              lt: new Date(weekStart.getTime() + WEEK_MS),
            },
          },
          select: { dataPublicacao: true },
        }),
        prisma.conteudo.groupBy({ by: ["etapa"], where: notPublished, _count: { _all: true } }),
        prisma.conteudo.findMany({
          where: { ...notPublished, dataPublicacao: { lt: now } },
          orderBy: { dataPublicacao: "asc" },
          take: AGENDA_LIMIT,
          select: agendaSelect,
        }),
        prisma.conteudo.count({ where: { ...notPublished, dataPublicacao: { lt: now } } }),
        prisma.conteudo.findMany({
          where: { ...notPublished, dataPublicacao: { gte: now, lt: new Date(now.getTime() + AGENDA_DAYS * DAY_MS) } },
          orderBy: { dataPublicacao: "asc" },
          take: AGENDA_LIMIT,
          select: agendaSelect,
        }),
        prisma.ideia.count({ where: { workspaceId, status: "NOVA" } }),
        prisma.ideia.findMany({
          where: { workspaceId, status: "NOVA" },
          orderBy: { criadoEm: "desc" },
          take: RECENT_IDEAS,
          select: { id: true, titulo: true, plataforma: true, criadoEm: true },
        }),
        prisma.conteudo.findMany({
          where: {
            workspaceId,
            etapa: FINAL_STAGE,
            dataPublicacao: { gte: new Date(now.getTime() - PERFORMANCE_DAYS * DAY_MS), lte: now },
          },
          select: {
            id: true,
            titulo: true,
            plataforma: true,
            formato: true,
            dataPublicacao: true,
            metricas: { select: latestMetricSelect, orderBy: { coletadoEm: "desc" }, take: 1 },
          },
        }),
      ]);

      const goal = weeklyGoalProgress(
        publishedDates.flatMap(({ dataPublicacao }) => (dataPublicacao ? [dataPublicacao] : [])),
        weekStart,
        workspace?.metaSemanal ?? 3
      );

      const porEtapa = Object.fromEntries(
        CONTENT_STAGES.filter((stage) => stage !== FINAL_STAGE).map((stage) => [stage, 0])
      ) as Record<string, number>;
      for (const group of stageGroups) porEtapa[group.etapa] = group._count._all;

      const performanceItems = recentPublished.map(({ metricas, ...conteudo }) => ({
        ...conteudo,
        metrica: metricas[0] ?? null,
      }));
      const { totais } = summarize(performanceItems);
      const top = performanceItems
        .filter((item) => item.metrica && item.metrica.visualizacoes > 0)
        .sort((a, b) => (b.metrica?.visualizacoes ?? 0) - (a.metrica?.visualizacoes ?? 0))[0];

      return res.json({
        meta: { ...goal, podeEditar: canManageWorkspace(req.workspaceRole) },
        pipeline: {
          porEtapa,
          ativos: Object.values(porEtapa).reduce((sum, count) => sum + count, 0),
        },
        agenda: { atrasados: overdue, totalAtrasados: overdueCount, proximos: upcoming, dias: AGENDA_DAYS },
        ideias: { novas: newIdeasCount, recentes: recentIdeas },
        desempenho: {
          dias: PERFORMANCE_DAYS,
          totais,
          destaque: top
            ? {
                id: top.id,
                titulo: top.titulo,
                plataforma: top.plataforma,
                formato: top.formato,
                dataPublicacao: top.dataPublicacao,
                visualizacoes: top.metrica?.visualizacoes ?? 0,
                taxaEngajamento: engagementRate(top.metrica),
              }
            : null,
        },
      });
    } catch (error: any) {
      console.error("Erro ao montar dashboard:", error);
      return res.status(500).json({ error: "Erro ao carregar o painel." });
    }
  }
}
