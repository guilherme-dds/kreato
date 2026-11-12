import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, RefreshCw, Search, SquareKanban } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { UsageBar } from "../components/UsageBar";
import { ContentCard } from "../components/pipeline/ContentCard";
import { NewContentModal } from "../components/pipeline/NewContentModal";
import { ScheduleDialog } from "../components/pipeline/ScheduleDialog";
import { useAuth } from "../context/AuthContext";
import { useLayoutContext } from "../layouts/layoutContext";
import { getContentsApi, isPlanLimitError, planLimitResource, moveContentApi } from "../api/backend";
import type { Content, ContentMoveInput, ContentStage, Platform } from "../types";
import {
  CONTENT_STAGES,
  CONTENT_STAGE_LABELS,
  PLATFORMS,
  PLATFORM_LABELS,
} from "../utils/content";

const SEARCH_DEBOUNCE_MS = 250;
// A coluna "Publicado" cresce sem parar; o histórico completo fica no calendário
const PUBLISHED_VISIBLE_LIMIT = 20;

interface DropTarget {
  stage: ContentStage;
  /** Índice entre os cards visíveis da coluna, sem contar o card arrastado */
  index: number;
}

interface PendingSchedule {
  content: Content;
  index: number;
}

const byPosition = (a: Content, b: Content) => a.posicao - b.posicao || a.id - b.id;

/**
 * Aplica o movimento localmente com a mesma regra do backend:
 * o card entra no índice pedido e os demais da coluna são renumerados.
 */
function applyMove(list: Content[], id: number, stage: ContentStage, index: number, patch: Partial<Content> = {}) {
  const current = list.find((c) => c.id === id);
  if (!current) return list;

  const moving: Content = { ...current, ...patch, etapa: stage };
  const others = list.filter((c) => c.id !== id);
  const column = others.filter((c) => c.etapa === stage).sort(byPosition);
  column.splice(Math.min(Math.max(index, 0), column.length), 0, moving);

  const positions = new Map(column.map((c, i) => [c.id, i]));
  return [...others.filter((c) => c.etapa !== stage), ...column].map((c) => {
    const posicao = positions.get(c.id);
    return posicao === undefined ? c : { ...c, posicao };
  });
}

export const PipelinePage: React.FC = () => {
  const { token } = useAuth();
  const { showToast, openPlans } = useLayoutContext();

  const [contents, setContents] = useState<Content[]>([]);
  const [limit, setLimit] = useState<number | null>(null);
  const [creatableStages, setCreatableStages] = useState<ContentStage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [plataforma, setPlataforma] = useState<Platform | "">("");
  const [searchInput, setSearchInput] = useState("");
  const [busca, setBusca] = useState("");

  const [dragging, setDragging] = useState<Content | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [pendingSchedule, setPendingSchedule] = useState<PendingSchedule | null>(null);
  const [newContentStage, setNewContentStage] = useState<ContentStage | null>(null);

  const requestId = useRef(0);

  useEffect(() => {
    const timeout = setTimeout(() => setBusca(searchInput.trim().toLowerCase()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  // Carrega o board inteiro uma vez; filtros são aplicados no cliente para o arrastar continuar consistente
  const loadContents = useCallback(async () => {
    const current = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const response = await getContentsApi({}, token);
      if (current !== requestId.current) return;
      setContents(response.conteudos);
      setLimit(response.uso.limite);
      setCreatableStages(response.permissoes.criarEm);
    } catch (err) {
      if (current === requestId.current) setError(err instanceof Error ? err.message : "Erro ao carregar conteúdos");
    } finally {
      if (current === requestId.current) setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadContents();
  }, [loadContents]);

  const matchesFilters = useCallback(
    (content: Content) =>
      (!plataforma || content.plataforma === plataforma) &&
      (!busca ||
        content.titulo.toLowerCase().includes(busca) ||
        content.hashtags.some((tag) => tag.includes(busca.replace(/^#/, "")))),
    [plataforma, busca]
  );

  const columns = useMemo(() => {
    const grouped = new Map<ContentStage, Content[]>(CONTENT_STAGES.map((stage) => [stage, []]));
    [...contents].sort(byPosition).forEach((content) => grouped.get(content.etapa)?.push(content));
    return grouped;
  }, [contents]);

  const activeCount = contents.filter((c) => c.etapa !== "PUBLICADO").length;
  const hasFilters = Boolean(plataforma || busca);

  /** Cards exibidos na coluna: aplica os filtros e, sem filtros, limita "Publicado" aos mais recentes */
  const visibleCards = useCallback(
    (stage: ContentStage) => {
      const filtered = (columns.get(stage) ?? []).filter(matchesFilters);
      return stage === "PUBLICADO" && !hasFilters ? filtered.slice(-PUBLISHED_VISIBLE_LIMIT) : filtered;
    },
    [columns, matchesFilters, hasFilters]
  );

  const setBusy = (id: number, busy: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });

  /** Envia o movimento com atualização otimista; desfaz se a API recusar */
  const commitMove = async (content: Content, stage: ContentStage, index: number, extra: Partial<ContentMoveInput> = {}) => {
    const snapshot = contents;
    const patch: Partial<Content> = {};
    if (extra.dataPublicacao !== undefined) patch.dataPublicacao = extra.dataPublicacao;
    setContents((prev) => applyMove(prev, content.id, stage, index, patch));
    setBusy(content.id, true);

    try {
      const saved = await moveContentApi(content.id, { etapa: stage, posicao: index, ...extra }, token);
      setContents((prev) => prev.map((c) => (c.id === saved.id ? { ...c, ...saved } : c)));
      if (stage !== content.etapa && stage === "PUBLICADO") {
        showToast("success", `"${content.titulo}" publicado! 🎉`);
      }
    } catch (err) {
      setContents(snapshot);
      showToast("error", err instanceof Error ? err.message : "Erro ao mover conteúdo");
      if (isPlanLimitError(err)) openPlans(planLimitResource(err));
    } finally {
      setBusy(content.id, false);
    }
  };

  /**
   * Converte o índice entre cards visíveis (com filtros ativos) no índice real da coluna
   * e dispara o movimento, pedindo a data antes quando o destino é "Agendado".
   */
  const requestMove = (content: Content, stage: ContentStage, visibleIndex: number) => {
    const column = (columns.get(stage) ?? []).filter((c) => c.id !== content.id);
    const visible = visibleCards(stage).filter((c) => c.id !== content.id);
    const anchor = visible[visibleIndex];
    const lastVisible = visible[visible.length - 1];
    let index = column.length;
    if (anchor) index = column.indexOf(anchor);
    else if (lastVisible) index = column.indexOf(lastVisible) + 1;

    const currentIndex = (columns.get(content.etapa) ?? []).findIndex((c) => c.id === content.id);
    if (stage === content.etapa && index === currentIndex) return;

    if (!content.permissoes.moverPara.includes(stage)) {
      showToast(
        "error",
        content.etapa === "ROTEIRO" && stage === "GRAVACAO"
          ? "O roteiro precisa ser aprovado por um gestor para seguir para a gravação."
          : `Seu papel não permite mover conteúdos para ${CONTENT_STAGE_LABELS[stage]}.`
      );
      return;
    }

    if (stage === "AGENDADO" && !content.dataPublicacao) {
      setPendingSchedule({ content, index });
      return;
    }
    commitMove(content, stage, index);
  };

  const handleStep = (content: Content, direction: -1 | 1) => {
    const stage = CONTENT_STAGES[CONTENT_STAGES.indexOf(content.etapa) + direction];
    if (!stage) return;
    requestMove(content, stage, visibleCards(stage).length);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, stage: ContentStage) => {
    if (!dragging) return;
    // Colunas fora do alcance do papel não aceitam o drop (cursor "proibido", sem indicador)
    if (!dragging.permissoes.moverPara.includes(stage)) {
      if (dropTarget) setDropTarget(null);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const cards = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-card-id]")).filter(
      (el) => el.dataset.cardId !== String(dragging.id)
    );
    let index = cards.findIndex((el) => {
      const rect = el.getBoundingClientRect();
      return e.clientY < rect.top + rect.height / 2;
    });
    if (index === -1) index = cards.length;

    if (dropTarget?.stage !== stage || dropTarget.index !== index) setDropTarget({ stage, index });
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, stage: ContentStage) => {
    e.preventDefault();
    if (dragging && dropTarget?.stage === stage) requestMove(dragging, stage, dropTarget.index);
    setDragging(null);
    setDropTarget(null);
  };

  const endDrag = () => {
    setDragging(null);
    setDropTarget(null);
  };

  return (
    <div className="page page-wide">
      <PageHeader
        title="Pipeline"
        description="Acompanhe cada conteúdo da ideia à publicação. Arraste os cards entre as etapas."
        actions={
          creatableStages.length > 0 && (
            <button className="btn btn-primary" onClick={() => setNewContentStage(creatableStages[0])}>
              <Plus size={18} /> Novo conteúdo
            </button>
          )
        }
      />

      {limit !== null && !isLoading && !error && (
        <UsageBar
          used={activeCount}
          limit={limit}
          label="conteúdos em produção no plano Gratuito"
          upgradeLabel="Produção ilimitada no Creator"
          onUpgrade={() => openPlans()}
        />
      )}

      <div className="ideas-filters">
        <div className="ideas-search">
          <Search size={16} />
          <input
            type="search"
            placeholder="Filtrar por título ou hashtag"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Filtrar conteúdos"
          />
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
      </div>

      {isLoading && contents.length === 0 ? (
        <div className="catalog-loading">
          <RefreshCw className="spinning-icon" size={28} />
          <span>Carregando pipeline...</span>
        </div>
      ) : error ? (
        <div className="catalog-empty">
          <div className="empty-icon-wrapper">
            <SquareKanban size={28} />
          </div>
          <h3>Não foi possível carregar o pipeline</h3>
          <p>{error}</p>
          <button className="btn btn-sm ideas-empty-action" onClick={loadContents}>
            <RefreshCw size={14} /> Tentar novamente
          </button>
        </div>
      ) : (
        <div className="kanban-board">
          {CONTENT_STAGES.map((stage) => {
            const column = columns.get(stage) ?? [];
            const visible = visibleCards(stage);
            const hiddenPublished = hasFilters ? 0 : column.length - visible.length;
            const isTarget = dropTarget?.stage === stage;
            const isLocked = dragging !== null && !dragging.permissoes.moverPara.includes(stage);
            const cardsWithoutDragged = visible.filter((c) => c.id !== dragging?.id);

            return (
              <section key={stage} className={`kanban-column stage-${stage.toLowerCase()} ${isTarget ? "is-drop-target" : ""} ${isLocked ? "is-drop-locked" : ""}`}>
                <header className="kanban-column-header">
                  <span className="kanban-column-dot" />
                  <h2>{CONTENT_STAGE_LABELS[stage]}</h2>
                  <span className="kanban-column-count">{hasFilters ? `${visible.length}/${column.length}` : column.length}</span>
                  {creatableStages.includes(stage) && (
                    <button
                      className="idea-action kanban-column-add"
                      onClick={() => setNewContentStage(stage)}
                      title={`Novo conteúdo em ${CONTENT_STAGE_LABELS[stage]}`}
                      aria-label={`Novo conteúdo em ${CONTENT_STAGE_LABELS[stage]}`}
                    >
                      <Plus size={16} />
                    </button>
                  )}
                </header>

                <div
                  className="kanban-column-body"
                  onDragOver={(e) => handleDragOver(e, stage)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, stage)}
                >
                  {hiddenPublished > 0 && (
                    <p className="kanban-column-note">+ {hiddenPublished} publicados anteriores</p>
                  )}
                  {visible.map((content) => {
                    const indexWithoutDragged = cardsWithoutDragged.indexOf(content);
                    return (
                      <React.Fragment key={content.id}>
                        {isTarget && dropTarget.index === indexWithoutDragged && <div className="kanban-drop-indicator" />}
                        <ContentCard
                          content={content}
                          isDragging={dragging?.id === content.id}
                          isBusy={busyIds.has(content.id)}
                          onDragStart={setDragging}
                          onDragEnd={endDrag}
                          onStep={handleStep}
                        />
                      </React.Fragment>
                    );
                  })}
                  {isTarget && dropTarget.index >= cardsWithoutDragged.length && <div className="kanban-drop-indicator" />}
                  {visible.length === 0 && !isTarget && (
                    <p className="kanban-column-empty">{hasFilters ? "Nada com esses filtros" : "Arraste cards para cá"}</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {newContentStage && (
        <NewContentModal
          initialStage={newContentStage}
          stages={creatableStages}
          onClose={() => setNewContentStage(null)}
          onCreated={(created) => {
            setNewContentStage(null);
            setContents((prev) => [...prev, created]);
            showToast("success", `"${created.titulo}" adicionado em ${CONTENT_STAGE_LABELS[created.etapa]}.`);
          }}
        />
      )}

      {pendingSchedule && (
        <ScheduleDialog
          title={pendingSchedule.content.titulo}
          onCancel={() => setPendingSchedule(null)}
          onConfirm={(isoDate) => {
            const { content, index } = pendingSchedule;
            setPendingSchedule(null);
            commitMove(content, "AGENDADO", index, { dataPublicacao: isoDate });
          }}
        />
      )}
    </div>
  );
};
