import React from "react";
import { Link } from "react-router-dom";
import { CalendarClock, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import type { Content } from "../../types";
import { CONTENT_FORMAT_LABELS, CONTENT_STAGE_LABELS, CONTENT_STAGES, PLATFORM_LABELS, formatDateTime } from "../../utils/content";

interface ContentCardProps {
  content: Content;
  isDragging: boolean;
  isBusy: boolean;
  onDragStart: (content: Content) => void;
  onDragEnd: () => void;
  /** Move para a etapa anterior/seguinte (alternativa ao arrastar, útil em telas de toque) */
  onStep: (content: Content, direction: -1 | 1) => void;
}

export const ContentCard: React.FC<ContentCardProps> = ({
  content,
  isDragging,
  isBusy,
  onDragStart,
  onDragEnd,
  onStep,
}) => {
  const stageIndex = CONTENT_STAGES.indexOf(content.etapa);
  const previousStage = CONTENT_STAGES[stageIndex - 1];
  const nextStage = CONTENT_STAGES[stageIndex + 1];
  const isOverdue =
    content.etapa === "AGENDADO" && content.dataPublicacao !== null && new Date(content.dataPublicacao) < new Date();

  return (
    <article
      className={`kanban-card ${isDragging ? "is-dragging" : ""} ${isBusy ? "is-busy" : ""}`}
      data-card-id={content.id}
      draggable={!isBusy}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(content.id));
        onDragStart(content);
      }}
      onDragEnd={onDragEnd}
    >
      {(content.plataforma || content.formato) && (
        <div className="kanban-card-badges">
          {content.plataforma && (
            <span className={`idea-badge platform-${content.plataforma.toLowerCase()}`}>
              {PLATFORM_LABELS[content.plataforma]}
            </span>
          )}
          {content.formato && <span className="idea-badge">{CONTENT_FORMAT_LABELS[content.formato]}</span>}
        </div>
      )}

      <Link to={`/pipeline/${content.id}`} className="kanban-card-title" draggable={false}>
        {content.titulo}
      </Link>

      {content.dataPublicacao && (
        <span className={`kanban-card-date ${isOverdue ? "is-overdue" : ""}`}>
          <CalendarClock size={13} />
          {formatDateTime(content.dataPublicacao)}
          {isOverdue && " · atrasado"}
        </span>
      )}

      <footer className="kanban-card-footer">
        <span className="kanban-card-author" title={content.autor?.nome ?? undefined}>
          {content.autor?.nome?.charAt(0).toUpperCase() ?? "?"}
        </span>
        {content.urlPublicacao && (
          <a
            className="idea-action"
            href={content.urlPublicacao}
            target="_blank"
            rel="noreferrer"
            title="Abrir publicação"
            draggable={false}
          >
            <ExternalLink size={14} />
          </a>
        )}
        <div className="kanban-card-steps">
          <button
            className="idea-action"
            disabled={!previousStage || isBusy}
            onClick={() => onStep(content, -1)}
            title={previousStage ? `Voltar para ${CONTENT_STAGE_LABELS[previousStage]}` : undefined}
            aria-label="Mover para a etapa anterior"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            className="idea-action"
            disabled={!nextStage || isBusy}
            onClick={() => onStep(content, 1)}
            title={nextStage ? `Avançar para ${CONTENT_STAGE_LABELS[nextStage]}` : undefined}
            aria-label="Mover para a próxima etapa"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </footer>
    </article>
  );
};
