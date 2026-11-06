import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import { useLayoutContext } from "../layouts/layoutContext";
import { getContentsApi, updateContentApi } from "../api/backend";
import type { Content, Platform } from "../types";
import { CONTENT_STAGE_LABELS, CREATABLE_STAGES, PLATFORMS, PLATFORM_LABELS } from "../utils/content";
import {
  WEEKDAY_LABELS,
  addMonths,
  dayKey,
  formatLongDay,
  formatMonthTitle,
  formatTime,
  monthGridDays,
  moveToDay,
  parseDayKey,
  rangeToIso,
  startOfMonth,
} from "../utils/dates";

const MAX_CHIPS_PER_DAY = 3;

const byDate = (a: Content, b: Content) =>
  new Date(a.dataPublicacao ?? 0).getTime() - new Date(b.dataPublicacao ?? 0).getTime();

/** Conteúdos publicados ficam fixos no calendário: a data registra quando foram ao ar */
// Agendar é exclusivo de quem gerencia o workspace (o backend devolve isso em permissoes)
const canReschedule = (content: Content) => content.etapa !== "PUBLICADO" && content.permissoes.editarPublicacao;

export const CalendarPage: React.FC = () => {
  const { token } = useAuth();
  const { showToast } = useLayoutContext();

  const todayKey = dayKey(new Date());
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [plataforma, setPlataforma] = useState<Platform | "">("");

  const [scheduled, setScheduled] = useState<Content[]>([]);
  const [unscheduled, setUnscheduled] = useState<Content[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dragging, setDragging] = useState<Content | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  const requestId = useRef(0);
  const gridDays = useMemo(() => monthGridDays(month), [month]);

  const loadMonth = useCallback(async () => {
    const current = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      // Conteúdos com data na grade + conteúdos em produção ainda sem data (para planejar)
      const [inRange, inProduction] = await Promise.all([
        getContentsApi(rangeToIso(gridDays), token),
        getContentsApi({ etapa: CREATABLE_STAGES.join(",") }, token),
      ]);
      if (current !== requestId.current) return;
      setScheduled(inRange.conteudos);
      setUnscheduled(inProduction.conteudos.filter((c) => !c.dataPublicacao));
    } catch (err) {
      if (current === requestId.current) setError(err instanceof Error ? err.message : "Erro ao carregar calendário");
    } finally {
      if (current === requestId.current) setIsLoading(false);
    }
  }, [gridDays, token]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  const matchesFilter = useCallback((c: Content) => !plataforma || c.plataforma === plataforma, [plataforma]);

  const contentsByDay = useMemo(() => {
    const map = new Map<string, Content[]>();
    scheduled
      .filter((c) => c.dataPublicacao && matchesFilter(c))
      .sort(byDate)
      .forEach((c) => {
        const key = dayKey(new Date(c.dataPublicacao as string));
        map.set(key, [...(map.get(key) ?? []), c]);
      });
    return map;
  }, [scheduled, matchesFilter]);

  const summary = useMemo(() => {
    const inMonth = scheduled.filter(
      (c) => c.dataPublicacao && new Date(c.dataPublicacao).getMonth() === month.getMonth() && matchesFilter(c)
    );
    return {
      publicados: inMonth.filter((c) => c.etapa === "PUBLICADO").length,
      agendados: inMonth.filter((c) => c.etapa === "AGENDADO").length,
      emProducao: inMonth.filter((c) => c.etapa !== "PUBLICADO" && c.etapa !== "AGENDADO").length,
    };
  }, [scheduled, month, matchesFilter]);

  const visibleUnscheduled = unscheduled.filter(matchesFilter);
  const selectedContents = contentsByDay.get(selectedDay) ?? [];
  const selectedDate = parseDayKey(selectedDay);

  const changeMonth = (amount: number) => {
    const next = addMonths(month, amount);
    setMonth(next);
    setSelectedDay(dayKey(next));
  };

  const goToToday = () => {
    setMonth(startOfMonth(new Date()));
    setSelectedDay(todayKey);
  };

  const setBusy = (id: number, busy: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });

  /** Define a data do conteúdo no dia escolhido (mantendo o horário), com atualização otimista */
  const scheduleOnDay = async (content: Content, key: string) => {
    if (!canReschedule(content)) return;
    const newDate = moveToDay(parseDayKey(key), content.dataPublicacao);
    if (newDate === content.dataPublicacao) return;

    const snapshot = { scheduled, unscheduled };
    const updated = { ...content, dataPublicacao: newDate };
    setUnscheduled((prev) => prev.filter((c) => c.id !== content.id));
    setScheduled((prev) => [...prev.filter((c) => c.id !== content.id), updated]);
    setBusy(content.id, true);

    try {
      const saved = await updateContentApi(content.id, { dataPublicacao: newDate }, token);
      setScheduled((prev) => prev.map((c) => (c.id === saved.id ? { ...c, ...saved } : c)));
      showToast("success", `"${content.titulo}" planejado para ${formatLongDay(parseDayKey(key)).toLowerCase()}.`);
    } catch (err) {
      setScheduled(snapshot.scheduled);
      setUnscheduled(snapshot.unscheduled);
      showToast("error", err instanceof Error ? err.message : "Erro ao reagendar conteúdo");
    } finally {
      setBusy(content.id, false);
    }
  };

  const startDrag = (e: React.DragEvent, content: Content) => {
    if (!canReschedule(content) || busyIds.has(content.id)) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(content.id));
    setDragging(content);
  };

  const endDrag = () => {
    setDragging(null);
    setDragOverDay(null);
  };

  const renderChip = (content: Content, compact = false) => (
    <Link
      key={content.id}
      to={`/pipeline/${content.id}`}
      className={`calendar-chip stage-${content.etapa.toLowerCase()} ${busyIds.has(content.id) ? "is-busy" : ""} ${
        dragging?.id === content.id ? "is-dragging" : ""
      }`}
      draggable={canReschedule(content)}
      onDragStart={(e) => startDrag(e, content)}
      onDragEnd={endDrag}
      title={`${content.titulo} · ${CONTENT_STAGE_LABELS[content.etapa]}`}
    >
      {!compact && content.dataPublicacao && <span className="calendar-chip-time">{formatTime(content.dataPublicacao)}</span>}
      <span className="calendar-chip-title">{content.titulo}</span>
    </Link>
  );

  return (
    <div className="page page-wide">
      <PageHeader
        icon={CalendarDays}
        title="Calendário"
        description="Planeje a semana, mantenha a constância e veja o que vai ao ar em cada dia."
      />

      <div className="calendar-toolbar">
        <div className="calendar-nav">
          <button className="idea-action" onClick={() => changeMonth(-1)} aria-label="Mês anterior">
            <ChevronLeft size={18} />
          </button>
          <h2 className="calendar-month-title">{formatMonthTitle(month)}</h2>
          <button className="idea-action" onClick={() => changeMonth(1)} aria-label="Próximo mês">
            <ChevronRight size={18} />
          </button>
          <button className="btn btn-sm calendar-today-btn" onClick={goToToday}>
            Hoje
          </button>
          {isLoading && <RefreshCw className="spinning-icon calendar-loading-icon" size={16} />}
        </div>

        <div className="calendar-summary">
          <span className="calendar-summary-item stage-publicado">{summary.publicados} publicados</span>
          <span className="calendar-summary-item stage-agendado">{summary.agendados} agendados</span>
          <span className="calendar-summary-item stage-roteiro">{summary.emProducao} em produção</span>
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
        </div>
      </div>

      {error ? (
        <div className="catalog-empty">
          <div className="empty-icon-wrapper">
            <CalendarDays size={28} />
          </div>
          <h3>Não foi possível carregar o calendário</h3>
          <p>{error}</p>
          <button className="btn btn-sm ideas-empty-action" onClick={loadMonth}>
            <RefreshCw size={14} /> Tentar novamente
          </button>
        </div>
      ) : (
        <div className="calendar-layout">
          <div className="calendar-grid" role="grid" aria-label={formatMonthTitle(month)}>
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="calendar-weekday" role="columnheader">
                {label}
              </div>
            ))}

            {gridDays.map((day) => {
              const key = dayKey(day);
              const items = contentsByDay.get(key) ?? [];
              const hidden = items.length - MAX_CHIPS_PER_DAY;
              const classes = [
                "calendar-day",
                day.getMonth() !== month.getMonth() && "is-outside",
                key === todayKey && "is-today",
                key < todayKey && "is-past",
                key === selectedDay && "is-selected",
                dragOverDay === key && "is-drop-target",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <div
                  key={key}
                  className={classes}
                  role="gridcell"
                  aria-selected={key === selectedDay}
                  tabIndex={0}
                  onClick={() => setSelectedDay(key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedDay(key);
                    }
                  }}
                  onDragOver={(e) => {
                    if (!dragging) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragOverDay !== key) setDragOverDay(key);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOverDay(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragging) scheduleOnDay(dragging, key);
                    endDrag();
                  }}
                >
                  <span className="calendar-day-number">{day.getDate()}</span>
                  <div className="calendar-day-items">
                    {items.slice(0, MAX_CHIPS_PER_DAY).map((content) => renderChip(content, true))}
                    {hidden > 0 && <span className="calendar-day-more">+{hidden} mais</span>}
                  </div>
                  {items.length > 0 && (
                    <div className="calendar-day-dots" aria-hidden="true">
                      {items.slice(0, 4).map((c) => (
                        <span key={c.id} className={`calendar-dot stage-${c.etapa.toLowerCase()}`} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <aside className="calendar-sidebar">
            <section className="editor-panel calendar-day-panel">
              <h3>{formatLongDay(selectedDate)}</h3>
              {selectedContents.length === 0 ? (
                <p className="calendar-panel-empty">Nada planejado para este dia.</p>
              ) : (
                <ul className="calendar-day-list">
                  {selectedContents.map((content) => (
                    <li key={content.id}>
                      <Link to={`/pipeline/${content.id}`} className={`calendar-list-item stage-${content.etapa.toLowerCase()}`}>
                        <span className="calendar-list-time">
                          {content.dataPublicacao ? formatTime(content.dataPublicacao) : "--:--"}
                        </span>
                        <span className="calendar-list-body">
                          <span className="calendar-list-title">{content.titulo}</span>
                          <span className="calendar-list-meta">
                            {CONTENT_STAGE_LABELS[content.etapa]}
                            {content.plataforma && ` · ${PLATFORM_LABELS[content.plataforma]}`}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              {visibleUnscheduled.length > 0 && (
                <div className="form-group calendar-plan-select">
                  <label htmlFor="calendar-plan">
                    <CalendarPlus size={14} /> Planejar para este dia
                  </label>
                  <select
                    id="calendar-plan"
                    value=""
                    onChange={(e) => {
                      const content = unscheduled.find((c) => c.id === Number(e.target.value));
                      if (content) scheduleOnDay(content, selectedDay);
                    }}
                  >
                    <option value="">Escolha um conteúdo sem data...</option>
                    {visibleUnscheduled.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.titulo} ({CONTENT_STAGE_LABELS[c.etapa]})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </section>

            <section className="editor-panel">
              <h3>Sem data ({visibleUnscheduled.length})</h3>
              {visibleUnscheduled.length === 0 ? (
                <p className="calendar-panel-empty">Todos os conteúdos em produção já têm data. 👏</p>
              ) : (
                <>
                  <p className="calendar-panel-hint">Arraste para um dia do calendário para planejar.</p>
                  <div className="calendar-unscheduled">{visibleUnscheduled.map((c) => renderChip(c))}</div>
                </>
              )}
            </section>
          </aside>
        </div>
      )}
    </div>
  );
};
