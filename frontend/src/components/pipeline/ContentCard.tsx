import React from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, MessageSquare } from "lucide-react";
import type { Content } from "../../types";
import { CONTENT_FORMAT_LABELS, CONTENT_STAGE_LABELS, CONTENT_STAGES, PLATFORM_LABELS, sceneNumber } from "../../utils/content";
import { slateDay, slateTime } from "../../utils/dates";
import { ProductionStrip } from "./ProductionStrip";

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
  // Só arrasta se o papel pode levar o card para alguma outra coluna
  const canMoveElsewhere = content.permissoes.moverPara.some((stage) => stage !== content.etapa);
  const canGoBack = previousStage !== undefined && content.permissoes.moverPara.includes(previousStage);
  const canGoForward = nextStage !== undefined && content.permissoes.moverPara.includes(nextStage);
  const isOverdue =
    content.etapa === "AGENDADO" && content.dataPublicacao !== null && new Date(content.dataPublicacao) < new Date();
  const publishDate = content.dataPublicacao ? new Date(content.dataPublicacao) : null;
  const meta = [
    content.plataforma && PLATFORM_LABELS[content.plataforma],
    content.formato && CONTENT_FORMAT_LABELS[content.formato],
  ].filter(Boolean) as string[];

  return (
    <article
      className={`kanban-card stage-${content.etapa.toLowerCase()} ${isDragging ? "is-dragging" : ""} ${isBusy ? "is-busy" : ""}`}
      data-card-id={content.id}
      draggable={!isBusy && canMoveElsewhere}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(content.id));
        onDragStart(content);
      }}
      onDragEnd={onDragEnd}
    >
      <header className="slate-band">
        <span className="slate-scene timecode">CENA {sceneNumber(content.id)}</span>
        {content.etapa === "GRAVACAO" && (
          <span className="slate-rec">
            <span className="rec-dot" aria-hidden="true" />
            REC
          </span>
        )}
      </header>

      <div className="slate-body">
        <Link to={`/pipeline/${content.id}`} className="kanban-card-title" draggable={false}>
          {content.titulo}
        </Link>

        {(meta.length > 0 || publishDate) && (
          <p className="slate-meta">
            {meta.length > 0 && <span>{meta.join(" · ")}</span>}
            {publishDate && (
              <time
                className={`slate-date timecode ${isOverdue ? "is-overdue" : ""}`}
                dateTime={content.dataPublicacao as string}
              >
                {slateDay(publishDate)} {slateTime(publishDate)}
                {isOverdue && " · ATRASADO"}
              </time>
            )}
          </p>
        )}

        <ProductionStrip stage={content.etapa} showCounter />
      </div>

      <footer className="kanban-card-footer">
        <span className="kanban-card-author" title={content.autor?.nome ?? undefined}>
          {content.autor?.nome?.charAt(0).toUpperCase() ?? "?"}
        </span>
        {content.comentariosAbertos > 0 && (
          <span
            className="kanban-card-comments"
            title={`${content.comentariosAbertos} comentário(s) em aberto`}
            aria-label={`${content.comentariosAbertos} comentário(s) em aberto`}
          >
            <MessageSquare size={13} />
            {content.comentariosAbertos}
          </span>
        )}
        {content.roteiroAprovadoEm && (
          <span className="kanban-card-approved" title="Roteiro aprovado" aria-label="Roteiro aprovado">
            <CheckCircle2 size={14} />
          </span>
        )}
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
            disabled={!canGoBack || isBusy}
            onClick={() => onStep(content, -1)}
            title={previousStage ? `Voltar para ${CONTENT_STAGE_LABELS[previousStage]}` : undefined}
            aria-label="Mover para a etapa anterior"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            className="idea-action"
            disabled={!canGoForward || isBusy}
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
