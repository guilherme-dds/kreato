import type { Request, Response } from "express";
import prisma from "../utils/prisma.js";
import { CONTENT_STAGES, FINAL_STAGE } from "../utils/content.js";
import { PAID_PLANS } from "../utils/billing.js";
import {
  bucketByDay,
  countByPlan,
  estimateMrrCents,
  parsePeriodDays,
  periodStart,
} from "../utils/adminStats.js";

/** Painel administrativo: números da plataforma inteira (todas as contas e workspaces) */
export class AdminController {
  /**
   * GET /admin/metricas?dias=30 — apenas role admin.
   * Os eventos de uso/segurança vêm do log-service (GET /api/logs/stats); aqui ficam os dados do banco.
   */
  async platformMetrics(req: Request, res: Response) {
    try {
      const days = parsePeriodDays(req.query.dias);
      const now = new Date();
      const start = periodStart(days, now);
      const inPeriod = { gte: start, lte: now };

      const [
        usersByPlan,
        newUsers,
        totalWorkspaces,
        teamWorkspaces,
        pendingInvites,
        contentsByStage,
        createdContents,
        published,
        approvedScripts,
        comments,
        activeIdeas,
        storage,
      ] = await Promise.all([
        prisma.usuario.groupBy({ by: ["plano"], _count: { _all: true } }),
        prisma.usuario.findMany({ where: { criadoEm: inPeriod }, select: { criadoEm: true } }),
        prisma.workspace.count(),
        // Workspaces com mais de uma pessoa (uso real do recurso de equipe)
        prisma.membroWorkspace.groupBy({
          by: ["workspaceId"],
          _count: { _all: true },
          having: { workspaceId: { _count: { gt: 1 } } },
        }),
        prisma.convite.count({ where: { status: "PENDENTE", expiraEm: { gt: now } } }),
        prisma.conteudo.groupBy({ by: ["etapa"], _count: { _all: true } }),
        prisma.conteudo.count({ where: { criadoEm: inPeriod } }),
        prisma.conteudo.findMany({
          where: { etapa: FINAL_STAGE, dataPublicacao: inPeriod },
          select: { dataPublicacao: true },
        }),
        prisma.conteudo.count({ where: { roteiroAprovadoEm: inPeriod } }),
        prisma.comentarioConteudo.count({ where: { criadoEm: inPeriod } }),
        prisma.ideia.count({ where: { status: { not: "ARQUIVADA" } } }),
        prisma.anexo.aggregate({ _sum: { tamanhoBytes: true } }),
      ]);

      const byPlan = countByPlan(usersByPlan.map((row) => ({ plano: row.plano, count: row._count._all })));
      const totalUsers = Object.values(byPlan).reduce((sum, count) => sum + count, 0);
      const stageCounts = new Map(contentsByStage.map((row) => [row.etapa, row._count._all]));

      return res.json({
        periodo: { dias: days, inicio: start.toISOString(), fim: now.toISOString() },
        usuarios: {
          total: totalUsers,
          novos: newUsers.length,
          porPlano: byPlan,
          pagantes: PAID_PLANS.reduce((sum, plan) => sum + byPlan[plan], 0),
          mrrEstimadoCentavos: estimateMrrCents(byPlan),
          novosPorDia: bucketByDay(
            newUsers.map((user) => user.criadoEm),
            days,
            now
          ),
        },
        workspaces: {
          total: totalWorkspaces,
          comEquipe: teamWorkspaces.length,
          convitesPendentes: pendingInvites,
        },
        conteudos: {
          total: contentsByStage.reduce((sum, row) => sum + row._count._all, 0),
          porEtapa: CONTENT_STAGES.map((etapa) => ({ etapa, total: stageCounts.get(etapa) ?? 0 })),
          criadosNoPeriodo: createdContents,
          publicadosNoPeriodo: published.length,
          publicadosPorDia: bucketByDay(
            published.flatMap((content) => (content.dataPublicacao ? [content.dataPublicacao] : [])),
            days,
            now
          ),
          roteirosAprovados: approvedScripts,
          comentarios: comments,
        },
        ideias: { ativas: activeIdeas },
        armazenamento: { bytes: storage._sum.tamanhoBytes ?? 0 },
      });
    } catch (error: any) {
      console.error("Erro ao calcular métricas da plataforma:", error);
      return res.status(500).json({ error: "Erro ao carregar métricas da plataforma." });
    }
  }
}
