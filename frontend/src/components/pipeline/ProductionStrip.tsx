import React, { useEffect, useRef } from "react";
import type { ContentStage } from "../../types";
import { CONTENT_STAGES, CONTENT_STAGE_LABELS } from "../../utils/content";

type SegmentState = "done" | "current" | "todo";

function segmentState(index: number, currentIndex: number): SegmentState {
  if (index < currentIndex) return "done";
  if (index === currentIndex) return "current";
  return "todo";
}

function stripLabel(stage: ContentStage): string {
  const index = CONTENT_STAGES.indexOf(stage);
  return `Etapa ${index + 1} de ${CONTENT_STAGES.length}: ${CONTENT_STAGE_LABELS[stage]}`;
}

interface ProductionStripProps {
  stage: ContentStage;
  /** Mostra o contador "3/6" ao lado da fita */
  showCounter?: boolean;
}

/**
 * Fita de produção: as seis etapas de um conteúdo como segmentos de película.
 * Feito = tinta, etapa atual = REC (ou verde quando publicado), restante = vazio.
 */
export const ProductionStrip: React.FC<ProductionStripProps> = ({ stage, showCounter = false }) => {
  const currentIndex = CONTENT_STAGES.indexOf(stage);
  const isPublished = stage === "PUBLICADO";

  return (
    <div className={`production-strip ${isPublished ? "is-published" : ""}`} role="img" aria-label={stripLabel(stage)}>
      <span className="production-strip-track" aria-hidden="true">
        {CONTENT_STAGES.map((item, index) => (
          <span key={item} className={`production-strip-segment is-${segmentState(index, currentIndex)}`} />
        ))}
      </span>
      {showCounter && (
        <span className="production-strip-counter timecode" aria-hidden="true">
          {currentIndex + 1}/{CONTENT_STAGES.length}
        </span>
      )}
    </div>
  );
};

interface ProductionStepperProps {
  stage: ContentStage;
  /** Etapas para as quais o papel atual pode mover o conteúdo */
  allowedStages: ContentStage[];
  disabled?: boolean;
  onSelect: (stage: ContentStage) => void;
}

/** A mesma fita em tamanho grande e clicável: cada segmento leva o conteúdo para aquela etapa */
export const ProductionStepper: React.FC<ProductionStepperProps> = ({ stage, allowedStages, disabled = false, onSelect }) => {
  const currentIndex = CONTENT_STAGES.indexOf(stage);
  const isPublished = stage === "PUBLICADO";
  const navRef = useRef<HTMLElement>(null);

  // Em telas estreitas a fita rola na horizontal: mantém a etapa atual centralizada
  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!nav || !current || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft = current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2;
  }, [stage]);

  return (
    <nav
      ref={navRef}
      className={`production-stepper ${isPublished ? "is-published" : ""}`}
      aria-label={stripLabel(stage)}
    >
      <ol>
        {CONTENT_STAGES.map((item, index) => {
          const state = segmentState(index, currentIndex);
          const isCurrent = state === "current";
          return (
            <li key={item}>
              <button
                type="button"
                className={`production-step is-${state}`}
                onClick={() => onSelect(item)}
                disabled={disabled || (!isCurrent && !allowedStages.includes(item))}
                aria-current={isCurrent ? "step" : undefined}
              >
                <span className="production-step-bar" aria-hidden="true" />
                <span className="production-step-label">
                  <span className="production-step-number timecode">{String(index + 1).padStart(2, "0")}</span>
                  {isCurrent && !isPublished && <span className="rec-dot" aria-hidden="true" />}
                  {CONTENT_STAGE_LABELS[item]}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

