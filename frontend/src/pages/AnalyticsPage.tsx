import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartColumn, Crown, ExternalLink, Eye, Heart, RefreshCw, TrendingUp, UserPlus } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { ChartEmpty, ChartTooltip } from "../components/charts/ChartTooltip";
import { StatTile } from "../components/charts/StatTile";
import { CHART, tooltipDatum } from "../components/charts/chartTheme";
import { useAuth } from "../context/AuthContext";
import { useLayoutContext } from "../layouts/layoutContext";
import { getMetricsSummaryApi } from "../api/backend";
import type { MetricsSummary, MetricsSummaryContent, Platform } from "../types";
import { CONTENT_FORMAT_LABELS, PLATFORMS, PLATFORM_LABELS } from "../utils/content";
import { formatCompact, formatNumber, formatPercent } from "../utils/format";

const PERIODS = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
  { days: 365, label: "12 meses" },
];

const RANKING_SIZE = 10;

type Granularity = "day" | "week" | "month";

interface Bucket {
  key: string;
  label: string;
  tooltipLabel: string;
  visualizacoes: number;
  conteudos: number;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function bucketStart(date: Date, granularity: Granularity): Date {
  const day = startOfDay(date);
  if (granularity === "week") day.setDate(day.getDate() - day.getDay());
  if (granularity === "month") day.setDate(1);
  return day;
}

function nextBucket(date: Date, granularity: Granularity): Date {
  const next = new Date(date);
  if (granularity === "day") next.setDate(next.getDate() + 1);
  else if (granularity === "week") next.setDate(next.getDate() + 7);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

function bucketLabels(date: Date, granularity: Granularity): { label: string; tooltipLabel: string } {
  const dayMonth = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  if (granularity === "day") {
    return { label: dayMonth, tooltipLabel: date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }) };
  }
  if (granularity === "week") return { label: dayMonth, tooltipLabel: `Semana de ${dayMonth}` };
  const month = date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(". de ", "/");
  return { label: month, tooltipLabel: date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) };
}

/**
 * Agrupa as visualizações pela data de publicação (no fuso local), incluindo períodos vazios
 * para o eixo do tempo não "pular" dias sem publicação.
 */
function bucketize(contents: MetricsSummaryContent[], from: Date, to: Date, granularity: Granularity): Bucket[] {
  const buckets = new Map<number, Bucket>();
  for (let cursor = bucketStart(from, granularity); cursor <= to; cursor = nextBucket(cursor, granularity)) {
    buckets.set(cursor.getTime(), {
      key: String(cursor.getTime()),
      ...bucketLabels(cursor, granularity),
      visualizacoes: 0,
      conteudos: 0,
    });
  }
  for (const content of contents) {
    if (!content.dataPublicacao) continue;
    const bucket = buckets.get(bucketStart(new Date(content.dataPublicacao), granularity).getTime());
    if (!bucket) continue;
    bucket.conteudos++;
    bucket.visualizacoes += content.metrica?.visualizacoes ?? 0;
  }
  return [...buckets.values()];
}

export const AnalyticsPage: React.FC = () => {
  const { token } = useAuth();
  const { openPlans } = useLayoutContext();

  const [days, setDays] = useState(30);
  const [plataforma, setPlataforma] = useState<Platform | "">("");
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setIsLoading(true);
    setError(null);
    const now = new Date();
    const from = startOfDay(new Date(now.getTime() - (days - 1) * 86_400_000));
    try {
      const data = await getMetricsSummaryApi({ de: from.toISOString(), ate: now.toISOString(), plataforma }, token);
      if (current === requestId.current) setSummary(data);
    } catch (err) {
      if (current === requestId.current) setError(err instanceof Error ? err.message : "Erro ao carregar métricas");
    } finally {
      if (current === requestId.current) setIsLoading(false);
    }
  }, [days, plataforma, token]);

  useEffect(() => {
    load();
  }, [load]);

  const granularity: Granularity = days <= 31 ? "day" : days <= 120 ? "week" : "month";

  const timeline = useMemo(() => {
    if (!summary) return [];
    // O backend pode ter encurtado o início (histórico do plano); o eixo segue o período efetivo
    return bucketize(summary.conteudos, new Date(summary.periodo.de), new Date(summary.periodo.ate), granularity);
  }, [summary, granularity]);

  const platformData = useMemo(
    () =>
      (summary?.porPlataforma ?? [])
        .filter((p) => p.conteudosComMetricas > 0)
        .map((p) => ({
          ...p,
          label: p.plataforma === "SEM_PLATAFORMA" ? "Sem plataforma" : PLATFORM_LABELS[p.plataforma],
        })),
    [summary]
  );

  const formatData = useMemo(
    () =>
      (summary?.porFormato ?? [])
        .filter((f) => f.taxaEngajamento !== null)
        .map((f) => ({
          ...f,
          taxa: f.taxaEngajamento ?? 0,
          label: f.formato === "SEM_FORMATO" ? "Sem formato" : CONTENT_FORMAT_LABELS[f.formato],
        }))
        .sort((a, b) => b.taxa - a.taxa),
    [summary]
  );

  const ranked = (summary?.conteudos ?? []).filter((c) => c.metrica);
  const withoutMetrics = (summary?.conteudos ?? []).filter((c) => !c.metrica);
  const totals = summary?.totais;

  const horizontalHeight = (rows: number) => Math.max(rows, 1) * 44 + 24;

  return (
    <div className="page page-wide">
      <PageHeader
        title="Métricas"
        description="Descubra quais conteúdos performam melhor e onde vale investir sua energia."
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
        <select
          className="ideas-select"
          value={plataforma}
          onChange={(e) => setPlataforma(e.target.value as Platform | "")}
          aria-label="Filtrar por plataforma"
        >
          <option value="">Todas as plataformas</option>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p]}
            </option>
          ))}
        </select>
        {isLoading && summary && <RefreshCw className="spinning-icon calendar-loading-icon" size={16} />}
      </div>

      {summary?.periodo.limitadoPeloPlano && (
        <div className="analytics-notice">
          <span>
            O plano Gratuito mostra os últimos {summary.periodo.historicoDias} dias de métricas.
          </span>
          <button className="usage-bar-upgrade" onClick={() => openPlans()}>
            <Crown size={14} /> Histórico completo no Creator
          </button>
        </div>
      )}

      {isLoading && !summary ? (
        <div className="catalog-loading">
          <RefreshCw className="spinning-icon" size={28} />
          <span>Carregando métricas...</span>
        </div>
      ) : error ? (
        <div className="catalog-empty">
          <div className="empty-icon-wrapper">
            <ChartColumn size={28} />
          </div>
          <h3>Não foi possível carregar as métricas</h3>
          <p>{error}</p>
          <button className="btn btn-sm ideas-empty-action" onClick={load}>
            <RefreshCw size={14} /> Tentar novamente
          </button>
        </div>
      ) : !summary || !totals || totals.conteudosPublicados === 0 ? (
        <div className="catalog-empty">
          <div className="empty-icon-wrapper">
            <ChartColumn size={28} />
          </div>
          <h3>Nenhum conteúdo publicado no período</h3>
          <p>Quando você publicar, registre os números de cada post no editor para acompanhar o desempenho aqui.</p>
          <Link to="/pipeline" className="btn btn-primary btn-sm ideas-empty-action">
            Ir para o pipeline
          </Link>
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <StatTile
              icon={<Eye size={16} />}
              label="Visualizações"
              value={formatCompact(totals.visualizacoes)}
              hint={`${totals.conteudosComMetricas} de ${totals.conteudosPublicados} conteúdos com métricas`}
            />
            <StatTile
              icon={<TrendingUp size={16} />}
              label="Taxa de engajamento"
              value={formatPercent(totals.taxaEngajamento)}
              hint="Interações ÷ visualizações"
            />
            <StatTile
              icon={<Heart size={16} />}
              label="Interações"
              value={formatCompact(totals.curtidas + totals.comentarios + totals.compartilhamentos + totals.salvamentos)}
              hint={`${formatCompact(totals.curtidas)} curtidas · ${formatCompact(totals.comentarios)} comentários`}
            />
            <StatTile
              icon={<UserPlus size={16} />}
              label="Seguidores ganhos"
              value={formatCompact(totals.seguidoresGanhos)}
              hint="Somente onde foi informado"
            />
          </div>

          <section className="chart-card">
            <header className="chart-card-header">
              <h2>Visualizações por data de publicação</h2>
              <p>
                {granularity === "day" ? "Por dia" : granularity === "week" ? "Por semana" : "Por mês"}, somando a medição
                mais recente de cada conteúdo
              </p>
            </header>
            <div className="chart-body" style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeline} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis
                    dataKey="label"
                    tick={CHART.axisTick}
                    tickLine={false}
                    axisLine={{ stroke: CHART.grid }}
                    interval="preserveStartEnd"
                    minTickGap={16}
                  />
                  <YAxis
                    tick={CHART.axisTick}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value: number) => formatCompact(value)}
                    width={64}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: CHART.cursor }}
                    content={({ active, payload }) => {
                      const datum = tooltipDatum<Bucket>(active, payload);
                      if (!datum) return null;
                      return (
                        <ChartTooltip
                          title={datum.tooltipLabel}
                          rows={[
                            { label: "Visualizações", value: formatNumber(datum.visualizacoes) },
                            { label: "Publicações", value: String(datum.conteudos) },
                          ]}
                        />
                      );
                    }}
                  />
                  <Bar
                    dataKey="visualizacoes"
                    fill={CHART.series}
                    radius={CHART.columnRadius}
                    maxBarSize={CHART.barSize}
                    activeBar={{ fill: CHART.seriesHover }}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="chart-row">
            <section className="chart-card">
              <header className="chart-card-header">
                <h2>Visualizações por plataforma</h2>
                <p>Onde seu conteúdo é mais visto</p>
              </header>
              {platformData.length === 0 ? (
                <ChartEmpty message="Registre métricas para comparar as plataformas." />
              ) : (
                <div className="chart-body" style={{ height: horizontalHeight(platformData.length) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={platformData} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="label"
                        tick={CHART.axisTick}
                        tickLine={false}
                        axisLine={false}
                        width={104}
                      />
                      <Tooltip
                        cursor={{ fill: CHART.cursor }}
                        content={({ active, payload }) => {
                          const datum = tooltipDatum<(typeof platformData)[number]>(active, payload);
                          if (!datum) return null;
                          return (
                            <ChartTooltip
                              title={datum.label}
                              rows={[
                                { label: "Visualizações", value: formatNumber(datum.visualizacoes) },
                                { label: "Engajamento", value: formatPercent(datum.taxaEngajamento) },
                                { label: "Conteúdos", value: String(datum.conteudosPublicados) },
                              ]}
                            />
                          );
                        }}
                      />
                      <Bar
                        dataKey="visualizacoes"
                        fill={CHART.series}
                        radius={CHART.barRadius}
                        maxBarSize={CHART.barSize}
                        activeBar={{ fill: CHART.seriesHover }}
                        isAnimationActive={false}
                      >
                        <LabelList
                          dataKey="visualizacoes"
                          position="right"
                          formatter={(value: unknown) => formatCompact(Number(value))}
                          className="chart-bar-label"
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="chart-card">
              <header className="chart-card-header">
                <h2>Engajamento por formato</h2>
                <p>Quais formatos geram mais interação por visualização</p>
              </header>
              {formatData.length === 0 ? (
                <ChartEmpty message="Defina o formato dos conteúdos e registre métricas para comparar." />
              ) : (
                <div className="chart-body" style={{ height: horizontalHeight(formatData.length) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={formatData} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="label"
                        tick={CHART.axisTick}
                        tickLine={false}
                        axisLine={false}
                        width={104}
                      />
                      <Tooltip
                        cursor={{ fill: CHART.cursor }}
                        content={({ active, payload }) => {
                          const datum = tooltipDatum<(typeof formatData)[number]>(active, payload);
                          if (!datum) return null;
                          return (
                            <ChartTooltip
                              title={datum.label}
                              rows={[
                                { label: "Engajamento", value: formatPercent(datum.taxaEngajamento) },
                                { label: "Visualizações", value: formatNumber(datum.visualizacoes) },
                                { label: "Conteúdos", value: String(datum.conteudosPublicados) },
                              ]}
                            />
                          );
                        }}
                      />
                      <Bar
                        dataKey="taxa"
                        fill={CHART.series}
                        radius={CHART.barRadius}
                        maxBarSize={CHART.barSize}
                        activeBar={{ fill: CHART.seriesHover }}
                        isAnimationActive={false}
                      >
                        <LabelList
                          dataKey="taxa"
                          position="right"
                          formatter={(value: unknown) => formatPercent(Number(value))}
                          className="chart-bar-label"
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
          </div>

          <section className="chart-card">
            <header className="chart-card-header">
              <h2>Ranking de conteúdos</h2>
              <p>Os mais vistos do período, pela medição mais recente</p>
            </header>
            {ranked.length === 0 ? (
              <ChartEmpty message="Nenhum conteúdo do período tem métricas registradas ainda." />
            ) : (
              <div className="ranking-table-wrapper">
                <table className="ranking-table">
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Conteúdo</th>
                      <th scope="col" className="num">
                        Visualizações
                      </th>
                      <th scope="col" className="num">
                        Engajamento
                      </th>
                      <th scope="col" className="num hide-mobile">
                        Seguidores
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.slice(0, RANKING_SIZE).map((content, index) => (
                      <tr key={content.id}>
                        <td className="ranking-position">{String(index + 1).padStart(2, "0")}</td>
                        <td>
                          <div className="ranking-content">
                            <Link to={`/pipeline/${content.id}`}>{content.titulo}</Link>
                            <span>
                              {content.plataforma ? PLATFORM_LABELS[content.plataforma] : "Sem plataforma"}
                              {content.dataPublicacao &&
                                ` · ${new Date(content.dataPublicacao).toLocaleDateString("pt-BR", {
                                  day: "2-digit",
                                  month: "short",
                                })}`}
                              {content.urlPublicacao && (
                                <a href={content.urlPublicacao} target="_blank" rel="noreferrer" aria-label="Abrir publicação">
                                  <ExternalLink size={12} />
                                </a>
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="num">{formatNumber(content.metrica?.visualizacoes ?? 0)}</td>
                        <td className="num">{formatPercent(content.taxaEngajamento)}</td>
                        <td className="num hide-mobile">
                          {content.metrica?.seguidoresGanhos != null ? formatNumber(content.metrica.seguidoresGanhos) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {withoutMetrics.length > 0 && (
              <div className="analytics-missing">
                <strong>{withoutMetrics.length} publicados sem métricas:</strong>{" "}
                {withoutMetrics.slice(0, 5).map((content, index) => (
                  <React.Fragment key={content.id}>
                    {index > 0 && ", "}
                    <Link to={`/pipeline/${content.id}`}>{content.titulo}</Link>
                  </React.Fragment>
                ))}
                {withoutMetrics.length > 5 && ` e mais ${withoutMetrics.length - 5}`}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};
