import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  HardDrive,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Users,
  UsersRound,
  XCircle,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { ChartEmpty, ChartTooltip } from "../components/charts/ChartTooltip";
import { StatTile } from "../components/charts/StatTile";
import { CHART, tooltipDatum } from "../components/charts/chartTheme";
import { useAuth } from "../context/AuthContext";
import { getAdminMetricsApi, getLogStatsApi } from "../api/backend";
import type { AdminMetrics, LogStats, Plan } from "../types";
import { CONTENT_STAGE_LABELS } from "../utils/content";
import { formatBytes } from "../utils/files";
import { formatCompact, formatCurrencyCents, formatNumber } from "../utils/format";
import { PLANS, PLAN_LABELS } from "../utils/plans";

const PERIODS = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
];

/** Nomes legíveis dos eventos de auditoria (o código original aparece no tooltip) */
const ACTION_LABELS: Record<string, string> = {
  LOGIN: "Logins",
  LOGOUT: "Logouts",
  ERROR: "Erros",
  PERMISSION_DENIED: "Acessos negados",
  PLAN_LIMIT_REACHED: "Limites de plano atingidos",
  PLAN_REQUIRED: "Recursos bloqueados por plano",
  PLAN_CHANGED: "Trocas de plano",
  CHECKOUT_STARTED: "Checkouts iniciados",
  CANCEL_SUBSCRIPTION: "Cancelamentos",
  VERIFY_STRIPE_PAYMENT_SUCCESS: "Pagamentos confirmados",
  VERIFY_STRIPE_SESSION_REJECTED: "Pagamentos recusados",
  IDEA_CREATED: "Ideias criadas",
  IDEA_DELETED: "Ideias excluídas",
  IDEA_CONVERTED: "Ideias levadas ao pipeline",
  CONTENT_CREATED: "Conteúdos criados",
  CONTENT_UPDATED: "Conteúdos editados",
  CONTENT_STAGE_CHANGED: "Mudanças de etapa",
  CONTENT_DELETED: "Conteúdos excluídos",
  SCRIPT_APPROVED: "Roteiros aprovados",
  SCRIPT_CHANGES_REQUESTED: "Ajustes pedidos",
  COMMENT_CREATED: "Comentários",
  ATTACHMENT_UPLOADED: "Anexos enviados",
  ATTACHMENT_DELETED: "Anexos excluídos",
  METRIC_RECORDED: "Métricas registradas",
  METRIC_DELETED: "Métricas excluídas",
  MEMBER_INVITED: "Convites enviados",
  INVITE_ACCEPTED: "Convites aceitos",
  INVITE_RESENT: "Convites reenviados",
  INVITE_REVOKED: "Convites cancelados",
  MEMBER_ROLE_CHANGED: "Papéis alterados",
  MEMBER_REMOVED: "Membros removidos",
  MEMBER_LEFT: "Saídas de equipe",
  WORKSPACE_UPDATED: "Workspaces editados",
};

const actionLabel = (acao: string) => ACTION_LABELS[acao] ?? acao;

const shortDay = (dia: string) => {
  const [, month, day] = dia.split("-");
  return `${day}/${month}`;
};

const longDay = (dia: string) =>
  new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const horizontalHeight = (rows: number) => Math.max(rows, 1) * 40 + 16;

/** Coluna por dia, série única na cor da marca */
const DailyColumns: React.FC<{ data: { dia: string; value: number }[]; seriesLabel: string }> = ({ data, seriesLabel }) => (
  <div className="chart-body" style={{ height: 220 }}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis
          dataKey="dia"
          tickFormatter={shortDay}
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={{ stroke: CHART.grid }}
          interval="preserveStartEnd"
          minTickGap={20}
        />
        <YAxis
          tick={CHART.axisTick}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) => formatCompact(value)}
          width={40}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: CHART.cursor }}
          content={({ active, payload }) => {
            const datum = tooltipDatum<{ dia: string; value: number }>(active, payload);
            if (!datum) return null;
            return <ChartTooltip title={longDay(datum.dia)} rows={[{ label: seriesLabel, value: formatNumber(datum.value) }]} />;
          }}
        />
        <Bar
          dataKey="value"
          fill={CHART.series}
          radius={CHART.columnRadius}
          maxBarSize={CHART.barSize}
          activeBar={{ fill: CHART.seriesHover }}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  </div>
);

/** Barras horizontais com rótulo de valor na ponta */
const HorizontalBars: React.FC<{
  data: { label: string; value: number; hint?: string }[];
  seriesLabel: string;
  labelWidth?: number;
}> = ({ data, seriesLabel, labelWidth = 120 }) => (
  <div className="chart-body" style={{ height: horizontalHeight(data.length) }}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis type="category" dataKey="label" tick={CHART.axisTick} tickLine={false} axisLine={false} width={labelWidth} />
        <Tooltip
          cursor={{ fill: CHART.cursor }}
          content={({ active, payload }) => {
            const datum = tooltipDatum<{ label: string; value: number; hint?: string }>(active, payload);
            if (!datum) return null;
            return (
              <ChartTooltip
                title={datum.label}
                rows={[
                  { label: seriesLabel, value: formatNumber(datum.value) },
                  ...(datum.hint ? [{ label: "Código", value: datum.hint }] : []),
                ]}
              />
            );
          }}
        />
        <Bar
          dataKey="value"
          fill={CHART.series}
          radius={CHART.barRadius}
          maxBarSize={CHART.barSize}
          activeBar={{ fill: CHART.seriesHover }}
          isAnimationActive={false}
        >
          <LabelList
            dataKey="value"
            position="right"
            formatter={(value: unknown) => formatCompact(Number(value))}
            className="chart-bar-label"
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
);

/** Painel da plataforma inteira: negócio e produção (banco) + uso e segurança (log-service) */
export const AdminPage: React.FC = () => {
  const { token } = useAuth();
  const [days, setDays] = useState(30);

  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [logStats, setLogStats] = useState<LogStats | null>(null);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const requestId = useRef(0);

  // As duas fontes carregam juntas, mas uma falha não esconde a outra
  const load = useCallback(async () => {
    const current = ++requestId.current;
    setIsLoading(true);
    const [metricsResult, logsResult] = await Promise.allSettled([
      getAdminMetricsApi(days, token),
      getLogStatsApi(days, token),
    ]);
    if (current !== requestId.current) return;

    if (metricsResult.status === "fulfilled") {
      setMetrics(metricsResult.value);
      setMetricsError(null);
    } else {
      // Sem dados antigos na tela: eles seriam de outro período
      setMetrics(null);
      setMetricsError(metricsResult.reason instanceof Error ? metricsResult.reason.message : "Erro ao carregar métricas");
    }
    if (logsResult.status === "fulfilled") {
      setLogStats(logsResult.value);
      setLogsError(null);
    } else {
      setLogStats(null);
      setLogsError(logsResult.reason instanceof Error ? logsResult.reason.message : "Erro ao carregar eventos");
    }
    setIsLoading(false);
  }, [days, token]);

  useEffect(() => {
    load();
  }, [load]);

  const periodLabel = `nos últimos ${days} dias`;

  return (
    <div className="page page-wide admin-page">
      <PageHeader
        icon={ShieldCheck}
        title="Admin"
        description="Saúde da plataforma: contas, assinaturas, produção e segurança de todos os workspaces."
      />

      <div className="analytics-filters">
        <div className="segmented" role="group" aria-label="Período">
          {PERIODS.map((period) => (
            <button
              key={period.days}
              className={`segmented-option ${days === period.days ? "active" : ""}`}
              onClick={() => setDays(period.days)}
              aria-pressed={days === period.days}
            >
              {period.label}
            </button>
          ))}
        </div>
        <button className="idea-action" onClick={load} disabled={isLoading} title="Atualizar" aria-label="Atualizar">
          <RefreshCw size={16} className={isLoading ? "spinning-icon" : undefined} />
        </button>
      </div>

      {isLoading && !metrics && !logStats ? (
        <div className="catalog-loading">
          <RefreshCw className="spinning-icon" size={28} />
          <span>Carregando painel...</span>
        </div>
      ) : (
        <>
          {/* ===== Negócio e produção (banco de dados) ===== */}
          {metricsError && !metrics ? (
            <SourceError title="Métricas da plataforma indisponíveis" message={metricsError} onRetry={load} />
          ) : (
            metrics && (
              <>
                <h2 className="admin-section-title">Contas e assinaturas</h2>
                <div className="stat-grid">
                  <StatTile
                    icon={<Users size={16} />}
                    label="Usuários"
                    value={formatNumber(metrics.usuarios.total)}
                    hint={`+${formatNumber(metrics.usuarios.novos)} ${periodLabel}`}
                  />
                  <StatTile
                    icon={<CheckCircle2 size={16} />}
                    label="Assinantes"
                    value={formatNumber(metrics.usuarios.pagantes)}
                    hint={`${metrics.usuarios.porPlano.CREATOR} Creator · ${metrics.usuarios.porPlano.STUDIO} Studio`}
                  />
                  <StatTile
                    icon={<CircleDollarSign size={16} />}
                    label="Receita mensal estimada"
                    value={formatCurrencyCents(metrics.usuarios.mrrEstimadoCentavos)}
                    hint="Pelo preço de tabela dos planos"
                  />
                  <StatTile
                    icon={<UsersRound size={16} />}
                    label="Workspaces com equipe"
                    value={formatNumber(metrics.workspaces.comEquipe)}
                    hint={`de ${formatNumber(metrics.workspaces.total)} · ${metrics.workspaces.convitesPendentes} convites pendentes`}
                  />
                </div>

                <div className="chart-row">
                  <section className="chart-card">
                    <header className="chart-card-header">
                      <h2>Novos cadastros por dia</h2>
                      <p>Contas criadas {periodLabel} (UTC)</p>
                    </header>
                    {metrics.usuarios.novos === 0 ? (
                      <ChartEmpty message="Nenhum cadastro no período." />
                    ) : (
                      <DailyColumns
                        data={metrics.usuarios.novosPorDia.map((d) => ({ dia: d.dia, value: d.total }))}
                        seriesLabel="Cadastros"
                      />
                    )}
                  </section>

                  <section className="chart-card">
                    <header className="chart-card-header">
                      <h2>Usuários por plano</h2>
                      <p>Todas as contas, hoje</p>
                    </header>
                    <HorizontalBars
                      data={PLANS.map((plan: Plan) => ({ label: PLAN_LABELS[plan], value: metrics.usuarios.porPlano[plan] }))}
                      seriesLabel="Usuários"
                    />
                  </section>
                </div>

                <h2 className="admin-section-title">Produção de conteúdo</h2>
                <div className="stat-grid">
                  <StatTile
                    icon={<FileText size={16} />}
                    label="Conteúdos criados"
                    value={formatNumber(metrics.conteudos.criadosNoPeriodo)}
                    hint={`${formatNumber(metrics.conteudos.total)} no total · ${formatNumber(metrics.ideias.ativas)} ideias ativas`}
                  />
                  <StatTile
                    icon={<Send size={16} />}
                    label="Publicados"
                    value={formatNumber(metrics.conteudos.publicadosNoPeriodo)}
                    hint={`Com data de publicação ${periodLabel}`}
                  />
                  <StatTile
                    icon={<MessageSquare size={16} />}
                    label="Revisão"
                    value={formatNumber(metrics.conteudos.roteirosAprovados)}
                    hint={`roteiros aprovados · ${formatNumber(metrics.conteudos.comentarios)} comentários`}
                  />
                  <StatTile
                    icon={<HardDrive size={16} />}
                    label="Armazenamento"
                    value={formatBytes(metrics.armazenamento.bytes)}
                    hint="Anexos de todos os workspaces"
                  />
                </div>

                <div className="chart-row">
                  <section className="chart-card">
                    <header className="chart-card-header">
                      <h2>Publicações por dia</h2>
                      <p>Conteúdos marcados como publicados {periodLabel}</p>
                    </header>
                    {metrics.conteudos.publicadosNoPeriodo === 0 ? (
                      <ChartEmpty message="Nenhuma publicação no período." />
                    ) : (
                      <DailyColumns
                        data={metrics.conteudos.publicadosPorDia.map((d) => ({ dia: d.dia, value: d.total }))}
                        seriesLabel="Publicações"
                      />
                    )}
                  </section>

                  <section className="chart-card">
                    <header className="chart-card-header">
                      <h2>Conteúdos por etapa</h2>
                      <p>Onde a produção está parada, hoje</p>
                    </header>
                    {metrics.conteudos.total === 0 ? (
                      <ChartEmpty message="Nenhum conteúdo criado ainda." />
                    ) : (
                      <HorizontalBars
                        data={metrics.conteudos.porEtapa.map((s) => ({ label: CONTENT_STAGE_LABELS[s.etapa], value: s.total }))}
                        seriesLabel="Conteúdos"
                        labelWidth={96}
                      />
                    )}
                  </section>
                </div>
              </>
            )
          )}

          {/* ===== Uso e segurança (log-service) ===== */}
          <h2 className="admin-section-title">Uso e segurança</h2>
          {logsError && !logStats ? (
            <SourceError
              title="Eventos de auditoria indisponíveis"
              message={`${logsError}. Verifique se o log-service está no ar.`}
              onRetry={load}
            />
          ) : (
            logStats && (
              <>
                <div className="stat-grid">
                  <StatTile
                    icon={<Activity size={16} />}
                    label="Usuários ativos"
                    value={formatNumber(logStats.usuariosAtivos)}
                    hint={`Com alguma ação ${periodLabel}`}
                  />
                  <StatTile
                    icon={<FileText size={16} />}
                    label="Eventos registrados"
                    value={formatCompact(logStats.total)}
                    hint={logStats.fonte === "memoria" ? "Redis indisponível: dados em memória" : "Fonte: Redis Stream"}
                  />
                  <StatTile
                    icon={<ShieldAlert size={16} />}
                    label="Acessos negados"
                    value={formatNumber(logStats.seguranca.acessosNegados)}
                    hint={`${formatNumber(logStats.seguranca.limitesAtingidos)} limites de plano atingidos`}
                  />
                  <StatTile
                    icon={<XCircle size={16} />}
                    label="Erros"
                    value={formatNumber(logStats.seguranca.erros)}
                    hint="Falhas de login, token ou servidor"
                  />
                </div>

                <section className="chart-card">
                  <header className="chart-card-header">
                    <h2>Usuários ativos por dia</h2>
                    <p>Pessoas distintas com pelo menos um evento no dia (UTC)</p>
                  </header>
                  {logStats.total === 0 ? (
                    <ChartEmpty message="Nenhum evento registrado no período." />
                  ) : (
                    <DailyColumns
                      data={logStats.porDia.map((d) => ({ dia: d.dia, value: d.usuariosAtivos }))}
                      seriesLabel="Usuários ativos"
                    />
                  )}
                </section>

                <div className="chart-row">
                  <section className="chart-card">
                    <header className="chart-card-header">
                      <h2>Ações mais frequentes</h2>
                      <p>As {logStats.porAcao.length} ações mais registradas {periodLabel}</p>
                    </header>
                    {logStats.porAcao.length === 0 ? (
                      <ChartEmpty message="Nenhum evento registrado no período." />
                    ) : (
                      <HorizontalBars
                        data={logStats.porAcao.map((a) => ({ label: actionLabel(a.acao), value: a.total, hint: a.acao }))}
                        seriesLabel="Eventos"
                        labelWidth={170}
                      />
                    )}
                  </section>

                  <section className="chart-card">
                    <header className="chart-card-header">
                      <h2>Eventos de segurança recentes</h2>
                      <p>Acessos negados, erros e pagamentos recusados</p>
                    </header>
                    {logStats.seguranca.recentes.length === 0 ? (
                      <ChartEmpty message="Nenhum evento de segurança no período." />
                    ) : (
                      <ul className="admin-events">
                        {logStats.seguranca.recentes.map((event, index) => (
                          <li key={`${event.timestamp}-${index}`} className="admin-event">
                            <span className={`admin-event-icon ${event.acao === "PERMISSION_DENIED" ? "is-denied" : "is-error"}`}>
                              {event.acao === "PERMISSION_DENIED" ? <ShieldAlert size={14} /> : <AlertTriangle size={14} />}
                            </span>
                            <div className="admin-event-info">
                              <span className="admin-event-title">
                                {actionLabel(event.acao)}
                                {event.entidade && (
                                  <span className="admin-event-entity">
                                    {event.entidade}
                                    {event.entidade_id ? ` #${event.entidade_id}` : ""}
                                  </span>
                                )}
                              </span>
                              <span className="admin-event-meta">
                                {event.user_id ? `usuário ${event.user_id.slice(0, 8)}` : "anônimo"} · IP {event.ip}
                              </span>
                            </div>
                            <time className="admin-event-time" dateTime={event.timestamp}>
                              {dateTime(event.timestamp)}
                            </time>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              </>
            )
          )}
        </>
      )}
    </div>
  );
};

const SourceError: React.FC<{ title: string; message: string; onRetry: () => void }> = ({ title, message, onRetry }) => (
  <div className="admin-source-error">
    <AlertTriangle size={18} />
    <div>
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
    <button className="btn btn-sm btn-primary" onClick={onRetry}>
      <RefreshCw size={14} /> Tentar de novo
    </button>
  </div>
);
