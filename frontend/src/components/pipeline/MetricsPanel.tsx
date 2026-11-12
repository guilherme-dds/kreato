import React, { useCallback, useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartColumn, Crown, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLayoutContext } from "../../layouts/layoutContext";
import { createMetricApi, deleteMetricApi, getContentMetricsApi } from "../../api/backend";
import type { ContentMetricsResponse, ContentStage, MetricSnapshot, MetricValues } from "../../types";
import { fromDateTimeLocal, toDateTimeLocal } from "../../utils/content";
import { formatCompact, formatNumber, formatPercent } from "../../utils/format";
import { ChartTooltip } from "../charts/ChartTooltip";
import { CHART, tooltipDatum } from "../charts/chartTheme";

const FIELDS: { key: keyof MetricValues; label: string; optional?: boolean }[] = [
  { key: "visualizacoes", label: "Visualizações" },
  { key: "curtidas", label: "Curtidas" },
  { key: "comentarios", label: "Comentários" },
  { key: "compartilhamentos", label: "Compartilhamentos" },
  { key: "salvamentos", label: "Salvamentos" },
  { key: "alcance", label: "Alcance", optional: true },
  { key: "seguidoresGanhos", label: "Seguidores ganhos", optional: true },
];

type FormValues = Record<keyof MetricValues, string>;

const emptyForm = (): FormValues => ({
  visualizacoes: "",
  curtidas: "",
  comentarios: "",
  compartilhamentos: "",
  salvamentos: "",
  alcance: "",
  seguidoresGanhos: "",
});

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

interface MetricsPanelProps {
  contentId: number;
  stage: ContentStage;
}

/** Métricas de um conteúdo publicado: registro manual dos números e evolução ao longo do tempo */
export const MetricsPanel: React.FC<MetricsPanelProps> = ({ contentId, stage }) => {
  const { token, user } = useAuth();
  const { showToast, openPlans } = useLayoutContext();

  const [data, setData] = useState<ContentMetricsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [collectedAt, setCollectedAt] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isPublished = stage === "PUBLICADO";

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setData(await getContentMetricsApi(contentId, token));
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao carregar métricas");
    } finally {
      setIsLoading(false);
    }
  }, [contentId, token, showToast]);

  useEffect(() => {
    if (isPublished) load();
  }, [isPublished, load]);

  const openForm = () => {
    // Pré-preenche com a última medição: normalmente só alguns números mudaram
    const last = data?.ultima;
    setForm(
      last
        ? (Object.fromEntries(FIELDS.map(({ key }) => [key, last[key] === null ? "" : String(last[key])])) as FormValues)
        : emptyForm()
    );
    setCollectedAt(toDateTimeLocal(new Date().toISOString()));
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, number | string> = {};
    for (const { key } of FIELDS) {
      if (form[key].trim() !== "") payload[key] = Number(form[key]);
    }
    const iso = fromDateTimeLocal(collectedAt);
    if (iso) payload.coletadoEm = iso;

    setIsSaving(true);
    setFormError(null);
    try {
      await createMetricApi(contentId, payload, token);
      setIsFormOpen(false);
      showToast("success", "Métricas registradas.");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro ao registrar métricas");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (metric: MetricSnapshot) => {
    if (!window.confirm(`Excluir a medição de ${shortDate(metric.coletadoEm)}?`)) return;
    try {
      await deleteMetricApi(metric.id, token);
      await load();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao excluir métrica");
    }
  };

  if (!isPublished) {
    return (
      <section className="editor-panel metrics-panel">
        <h3>
          <ChartColumn size={13} /> Métricas
        </h3>
        <p className="calendar-panel-empty">
          Quando este conteúdo for publicado, registre aqui as visualizações e interações para acompanhar o desempenho.
        </p>
      </section>
    );
  }

  const metrics = data?.metricas ?? [];
  const last = data?.ultima ?? null;
  const chartData = metrics.map((m) => ({ ...m, label: shortDate(m.coletadoEm) }));

  return (
    <section className="editor-panel metrics-panel">
      <div className="metrics-panel-header">
        <h3>
          <ChartColumn size={13} /> Métricas
        </h3>
        {!isFormOpen && (
          <button className="btn btn-primary btn-sm" onClick={openForm}>
            <Plus size={15} /> Registrar números
          </button>
        )}
      </div>

      {isFormOpen && (
        <form className="metrics-form" onSubmit={handleSubmit}>
          <div className="metrics-form-grid">
            {FIELDS.map(({ key, label, optional }) => (
              <div key={key} className="form-group">
                <label htmlFor={`metric-${key}`}>
                  {label}
                  {optional && <span className="field-counter"> (opcional)</span>}
                </label>
                <input
                  id={`metric-${key}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={form[key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder="0"
                />
              </div>
            ))}
            <div className="form-group">
              <label htmlFor="metric-coletado">Medido em</label>
              <input
                id="metric-coletado"
                type="datetime-local"
                value={collectedAt}
                max={toDateTimeLocal(new Date().toISOString())}
                onChange={(e) => setCollectedAt(e.target.value)}
              />
            </div>
          </div>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={() => setIsFormOpen(false)} disabled={isSaving}>
              <X size={14} /> Cancelar
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={isSaving}>
              {isSaving ? "Salvando..." : "Salvar medição"}
            </button>
          </div>
        </form>
      )}

      {isLoading && !data ? (
        <p className="calendar-panel-empty">Carregando métricas...</p>
      ) : !last ? (
        !isFormOpen && (
          <p className="calendar-panel-empty">
            Nenhuma medição ainda. Registre os números do post (ex.: 24h e 7 dias após publicar) para ver a evolução.
          </p>
        )
      ) : (
        <>
          <div className="metrics-stats">
            <div>
              <span>Visualizações</span>
              <strong>{formatCompact(last.visualizacoes)}</strong>
            </div>
            <div>
              <span>Engajamento</span>
              <strong>{formatPercent(last.taxaEngajamento)}</strong>
            </div>
            <div>
              <span>Curtidas</span>
              <strong>{formatCompact(last.curtidas)}</strong>
            </div>
            <div>
              <span>Comentários</span>
              <strong>{formatCompact(last.comentarios)}</strong>
            </div>
            <div>
              <span>Compart.</span>
              <strong>{formatCompact(last.compartilhamentos)}</strong>
            </div>
            <div>
              <span>Salvamentos</span>
              <strong>{formatCompact(last.salvamentos)}</strong>
            </div>
          </div>

          {chartData.length >= 2 && (
            <div className="metrics-chart">
              <p className="metrics-chart-title">Evolução das visualizações</p>
              <div style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke={CHART.grid} />
                    <XAxis
                      dataKey="label"
                      tick={CHART.axisTick}
                      tickLine={false}
                      axisLine={{ stroke: CHART.grid }}
                      interval="preserveStartEnd"
                      minTickGap={24}
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
                      cursor={{ stroke: CHART.grid, strokeWidth: 1 }}
                      content={({ active, payload }) => {
                        const datum = tooltipDatum<(typeof chartData)[number]>(active, payload);
                        if (!datum) return null;
                        return (
                          <ChartTooltip
                            title={datum.label}
                            rows={[
                              { label: "Visualizações", value: formatNumber(datum.visualizacoes) },
                              { label: "Engajamento", value: formatPercent(datum.taxaEngajamento) },
                            ]}
                          />
                        );
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="visualizacoes"
                      stroke={CHART.series}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dot={{ r: 4, fill: CHART.series, stroke: CHART.surface, strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: CHART.seriesHover, stroke: CHART.surface, strokeWidth: 2 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <ul className="metrics-history">
            {[...metrics].reverse().map((metric) => (
              <li key={metric.id}>
                <span className="metrics-history-date">{shortDate(metric.coletadoEm)}</span>
                <span>{formatNumber(metric.visualizacoes)} visualizações</span>
                <span className="metrics-history-rate">{formatPercent(metric.taxaEngajamento)}</span>
                {metric.registradoPor?.id === user?.id && (
                  <button
                    className="idea-action danger"
                    onClick={() => handleDelete(metric)}
                    title="Excluir medição"
                    aria-label={`Excluir medição de ${shortDate(metric.coletadoEm)}`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {data && data.historico.ocultas > 0 && (
        <div className="analytics-notice">
          <span>
            {data.historico.ocultas} medições com mais de {data.historico.dias} dias estão ocultas no plano Gratuito.
          </span>
          <button className="usage-bar-upgrade" onClick={() => openPlans()}>
            <Crown size={14} /> Ver histórico completo
          </button>
        </div>
      )}
    </section>
  );
};
