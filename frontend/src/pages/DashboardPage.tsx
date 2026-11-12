import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ChartColumn,
  Check,
  Flame,
  KanbanSquare,
  Lightbulb,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLayoutContext } from "../layouts/layoutContext";
import { PageHeader } from "../components/PageHeader";
import { getDashboardApi, updateWeeklyGoalApi } from "../api/backend";
import type { DashboardAgendaItem, DashboardData, WeeklyGoal } from "../types";
import { CONTENT_STAGE_LABELS, CONTENT_STAGES, PLATFORM_LABELS, formatDateTime, formatRelativeDate } from "../utils/content";
import { formatCompact, formatPercent } from "../utils/format";

const MIN_GOAL = 1;
const MAX_GOAL = 21;
const ACTIVE_STAGES = CONTENT_STAGES.filter((stage) => stage !== "PUBLICADO") as Exclude<
  (typeof CONTENT_STAGES)[number],
  "PUBLICADO"
>[];

const shortDay = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const plural = (count: number, singular: string, pluralForm: string) => `${count} ${count === 1 ? singular : pluralForm}`;

function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

/* --------------------------------------------------------------------------
   Meta semanal + sequência
   -------------------------------------------------------------------------- */
interface WeeklyGoalCardProps {
  goal: WeeklyGoal;
  onSave: (value: number) => Promise<void>;
}

const WeeklyGoalCard: React.FC<WeeklyGoalCardProps> = ({ goal, onSave }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(goal.meta);
  const [isSaving, setIsSaving] = useState(false);

  const progress = Math.min(goal.publicadosSemana / goal.meta, 1);
  const remaining = Math.max(goal.meta - goal.publicadosSemana, 0);
  const lastIndex = goal.semanas.length - 1;

  const startEditing = () => {
    setDraft(goal.meta);
    setIsEditing(true);
  };

  const save = async () => {
    if (draft === goal.meta) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      await onSave(draft);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="home-card home-goal">
      <header className="home-card-header">
        <h2>
          <Target size={16} /> Meta da semana
        </h2>
        {goal.podeEditar && !isEditing && (
          <button className="idea-action" onClick={startEditing} title="Alterar meta" aria-label="Alterar meta semanal">
            <Pencil size={14} />
          </button>
        )}
      </header>

      {isEditing ? (
        <div className="goal-editor">
          <span>Publicações por semana</span>
          <div className="goal-stepper">
            <button
              type="button"
              onClick={() => setDraft((value) => Math.max(MIN_GOAL, value - 1))}
              disabled={draft <= MIN_GOAL || isSaving}
              aria-label="Diminuir meta"
            >
              <Minus size={14} />
            </button>
            <strong aria-live="polite">{draft}</strong>
            <button
              type="button"
              onClick={() => setDraft((value) => Math.min(MAX_GOAL, value + 1))}
              disabled={draft >= MAX_GOAL || isSaving}
              aria-label="Aumentar meta"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="goal-editor-actions">
            <button className="btn-secondary" onClick={() => setIsEditing(false)} disabled={isSaving}>
              <X size={14} /> Cancelar
            </button>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={isSaving}>
              <Check size={14} /> {isSaving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="goal-headline">
            <strong>
              {goal.publicadosSemana}
              <span> / {goal.meta}</span>
            </strong>
            <p>
              {goal.semanaAtualConcluida
                ? "Meta cumprida! Tudo o que sair agora é bônus."
                : `Falta${remaining === 1 ? "" : "m"} ${plural(remaining, "publicação", "publicações")} para fechar a semana.`}
            </p>
          </div>
          <div
            className="goal-progress"
            role="progressbar"
            aria-label="Progresso da meta semanal"
            aria-valuemin={0}
            aria-valuemax={goal.meta}
            aria-valuenow={Math.min(goal.publicadosSemana, goal.meta)}
          >
            <div className={goal.semanaAtualConcluida ? "is-done" : ""} style={{ width: `${progress * 100}%` }} />
          </div>
        </>
      )}

      <div className="goal-streak">
        <div className={`goal-streak-badge ${goal.sequencia > 0 ? "is-active" : ""}`}>
          <Flame size={18} />
          <div>
            <strong>{plural(goal.sequencia, "semana", "semanas")}</strong>
            <span>{goal.sequencia > 0 ? "seguidas cumprindo a meta" : "Cumpra a meta para iniciar uma sequência"}</span>
          </div>
        </div>

        <ol className="goal-weeks" aria-label="Últimas semanas">
          {goal.semanas.map((week, index) => {
            const isCurrent = index === lastIndex;
            const status = week.atingiu ? "meta cumprida" : isCurrent ? "em andamento" : "meta não cumprida";
            return (
              <li
                key={week.inicio}
                className={`goal-week ${week.atingiu ? "is-done" : ""} ${isCurrent ? "is-current" : ""}`}
                title={`Semana de ${shortDay(week.inicio)}: ${plural(week.publicados, "publicação", "publicações")} (${status})`}
              >
                <span className="goal-week-box">{week.publicados}</span>
                <span className="goal-week-label">{isCurrent ? "Atual" : shortDay(week.inicio)}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
};

/* --------------------------------------------------------------------------
   Agenda: atrasados + próximos dias
   -------------------------------------------------------------------------- */
const AgendaItem: React.FC<{ item: DashboardAgendaItem; overdue?: boolean }> = ({ item, overdue }) => (
  <li>
    <Link to={`/pipeline/${item.id}`} className={`home-agenda-item stage-${item.etapa.toLowerCase()}`}>
      <span className="home-agenda-date">{formatDateTime(item.dataPublicacao)}</span>
      <span className="home-agenda-title">{item.titulo}</span>
      <span className="home-agenda-meta">
        {overdue ? (
          <span className="home-overdue">
            <AlertTriangle size={12} /> Atrasado
          </span>
        ) : (
          <span className="home-stage-dot">{CONTENT_STAGE_LABELS[item.etapa]}</span>
        )}
        {item.plataforma && <span>{PLATFORM_LABELS[item.plataforma]}</span>}
      </span>
    </Link>
  </li>
);

/* --------------------------------------------------------------------------
   Página
   -------------------------------------------------------------------------- */
export const DashboardPage: React.FC = () => {
  const { user, token } = useAuth();
  const { showToast } = useLayoutContext();
  const firstName = (user?.nome || user?.email?.split("@")[0] || "Criador").split(" ")[0];

  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const response = await getDashboardApi(token);
      if (current === requestId.current) setData(response);
    } catch (err) {
      if (current === requestId.current) setError(err instanceof Error ? err.message : "Erro ao carregar o painel");
    } finally {
      if (current === requestId.current) setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const saveGoal = async (value: number) => {
    try {
      await updateWeeklyGoalApi(value, token);
      showToast("success", `Meta atualizada para ${plural(value, "publicação", "publicações")} por semana.`);
      // A sequência depende da meta: recalcula no servidor
      await load();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao atualizar a meta");
      throw err;
    }
  };

  const header = (
    <PageHeader
      title={`${greeting()}, ${firstName}!`}
      description="Seu ritmo de publicação, o que vem pela frente e como seus conteúdos estão indo."
      actions={
        <Link to="/ideias" className="btn btn-primary btn-sm">
          <Plus size={15} /> Nova ideia
        </Link>
      }
    />
  );

  if (isLoading && !data) {
    return (
      <div className="page page-wide">
        {header}
        <div className="catalog-loading">
          <RefreshCw className="spinning-icon" size={28} />
          <span>Carregando seu painel...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page page-wide">
        {header}
        <div className="catalog-empty">
          <div className="empty-icon-wrapper">
            <Sparkles size={28} />
          </div>
          <h3>Não foi possível carregar o painel</h3>
          <p>{error}</p>
          <button className="btn btn-sm ideas-empty-action" onClick={load}>
            <RefreshCw size={14} /> Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const { meta, pipeline, agenda, ideias, desempenho } = data;
  const isNewCreator = pipeline.ativos === 0 && ideias.novas === 0 && desempenho.totais.conteudosPublicados === 0;
  const hasAgenda = agenda.atrasados.length > 0 || agenda.proximos.length > 0;

  return (
    <div className="page page-wide">
      {header}

      {isNewCreator && (
        <section className="home-card home-onboarding">
          <h2>Comece por aqui</h2>
          <ol>
            <li>
              <Link to="/ideias">
                <Lightbulb size={18} />
                <div>
                  <strong>Anote suas ideias</strong>
                  <span>Guarde ganchos e temas antes que eles escapem.</span>
                </div>
              </Link>
            </li>
            <li>
              <Link to="/pipeline">
                <KanbanSquare size={18} />
                <div>
                  <strong>Leve ao pipeline</strong>
                  <span>Roteiro, gravação, edição e agendamento em um quadro.</span>
                </div>
              </Link>
            </li>
            <li>
              <Link to="/metricas">
                <ChartColumn size={18} />
                <div>
                  <strong>Acompanhe os resultados</strong>
                  <span>Registre os números de cada post e veja o que funciona.</span>
                </div>
              </Link>
            </li>
          </ol>
        </section>
      )}

      <div className="home-grid">
        <WeeklyGoalCard goal={meta} onSave={saveGoal} />

        <section className="home-card">
          <header className="home-card-header">
            <h2>
              <ChartColumn size={16} /> Últimos {desempenho.dias} dias
            </h2>
            <Link to="/metricas" className="home-card-link">
              Métricas <ArrowRight size={14} />
            </Link>
          </header>
          {desempenho.totais.conteudosComMetricas === 0 ? (
            <p className="home-card-empty">
              {desempenho.totais.conteudosPublicados > 0
                ? `${plural(desempenho.totais.conteudosPublicados, "conteúdo publicado", "conteúdos publicados")} sem números ainda. Registre as métricas no editor de cada post.`
                : "Nenhuma publicação no período. Quando publicar, registre os números para ver o desempenho aqui."}
            </p>
          ) : (
            <>
              <div className="home-stats">
                <div>
                  <span>Visualizações</span>
                  <strong>{formatCompact(desempenho.totais.visualizacoes)}</strong>
                </div>
                <div>
                  <span>Engajamento</span>
                  <strong>{formatPercent(desempenho.totais.taxaEngajamento)}</strong>
                </div>
                <div>
                  <span>Publicados</span>
                  <strong>{desempenho.totais.conteudosPublicados}</strong>
                </div>
              </div>
              {desempenho.destaque && (
                <Link to={`/pipeline/${desempenho.destaque.id}`} className="home-highlight">
                  <span className="home-highlight-label">Destaque</span>
                  <strong>{desempenho.destaque.titulo}</strong>
                  <span>
                    {formatCompact(desempenho.destaque.visualizacoes)} visualizações ·{" "}
                    {formatPercent(desempenho.destaque.taxaEngajamento)} de engajamento
                  </span>
                </Link>
              )}
            </>
          )}
        </section>

        <section className="home-card">
          <header className="home-card-header">
            <h2>
              <CalendarClock size={16} /> Agenda
            </h2>
            <Link to="/calendario" className="home-card-link">
              Calendário <ArrowRight size={14} />
            </Link>
          </header>
          {!hasAgenda ? (
            <p className="home-card-empty">
              Nada planejado para os próximos {agenda.dias} dias. Defina datas de publicação no calendário para não
              perder o ritmo.
            </p>
          ) : (
            <>
              {agenda.atrasados.length > 0 && (
                <div className="home-agenda-group">
                  <h3 className="home-overdue">
                    {plural(agenda.totalAtrasados, "conteúdo atrasado", "conteúdos atrasados")}
                  </h3>
                  <ul className="home-agenda">
                    {agenda.atrasados.map((item) => (
                      <AgendaItem key={item.id} item={item} overdue />
                    ))}
                  </ul>
                </div>
              )}
              <div className="home-agenda-group">
                <h3>Próximos {agenda.dias} dias</h3>
                {agenda.proximos.length === 0 ? (
                  <p className="home-card-empty">Nenhuma publicação planejada.</p>
                ) : (
                  <ul className="home-agenda">
                    {agenda.proximos.map((item) => (
                      <AgendaItem key={item.id} item={item} />
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>

        <section className="home-card">
          <header className="home-card-header">
            <h2>
              <KanbanSquare size={16} /> Em produção
            </h2>
            <Link to="/pipeline" className="home-card-link">
              Pipeline <ArrowRight size={14} />
            </Link>
          </header>
          <ul className="home-stages">
            {ACTIVE_STAGES.map((stage) => (
              <li key={stage} className={`stage-${stage.toLowerCase()}`}>
                <span className="home-stage-dot">{CONTENT_STAGE_LABELS[stage]}</span>
                <strong>{pipeline.porEtapa[stage] ?? 0}</strong>
              </li>
            ))}
          </ul>

          <div className="home-ideas">
            <div className="home-ideas-header">
              <h3>
                <Lightbulb size={14} /> {plural(ideias.novas, "ideia nova", "ideias novas")}
              </h3>
              <Link to="/ideias" className="home-card-link">
                Ver ideias <ArrowRight size={14} />
              </Link>
            </div>
            {ideias.recentes.length > 0 && (
              <ul>
                {ideias.recentes.map((idea) => (
                  <li key={idea.id}>
                    <span>{idea.titulo}</span>
                    <small>{formatRelativeDate(idea.criadoEm)}</small>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
