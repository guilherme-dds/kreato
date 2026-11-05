import React, { useEffect, useState } from "react";
import { SquareKanban, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLayoutContext } from "../../layouts/layoutContext";
import { createContentApi, isPlanLimitError } from "../../api/backend";
import type { ContentDetail, ContentFormat, ContentStage, Platform } from "../../types";
import {
  CONTENT_FORMATS,
  CONTENT_FORMAT_LABELS,
  CONTENT_STAGE_LABELS,
  CREATABLE_STAGES,
  PLATFORMS,
  PLATFORM_LABELS,
} from "../../utils/content";

interface NewContentModalProps {
  initialStage: ContentStage;
  onClose: () => void;
  onCreated: (content: ContentDetail) => void;
}

export const NewContentModal: React.FC<NewContentModalProps> = ({ initialStage, onClose, onCreated }) => {
  const { token } = useAuth();
  const { showToast, openPlansModal } = useLayoutContext();

  const [titulo, setTitulo] = useState("");
  const [etapa, setEtapa] = useState<ContentStage>(initialStage);
  const [plataforma, setPlataforma] = useState<Platform | "">("");
  const [formato, setFormato] = useState<ContentFormat | "">("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSaving) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onClose]);

  const closeIfIdle = () => {
    if (!isSaving) onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) {
      setFormError("Dê um título para o conteúdo.");
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      const created = await createContentApi(
        { titulo: titulo.trim(), etapa, plataforma: plataforma || null, formato: formato || null },
        token
      );
      onCreated(created);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao criar conteúdo";
      if (isPlanLimitError(err)) {
        showToast("error", message);
        onClose();
        openPlansModal();
        return;
      }
      setFormError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeIfIdle()}>
      <div className="modal-card idea-modal" role="dialog" aria-modal="true" aria-labelledby="new-content-title">
        <button className="modal-close-btn" onClick={closeIfIdle} aria-label="Fechar">
          <X size={18} />
        </button>

        <div className="idea-modal-header">
          <div className="page-header-icon">
            <SquareKanban size={20} />
          </div>
          <h2 id="new-content-title">Novo conteúdo</h2>
        </div>

        <form className="idea-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="content-titulo">Título *</label>
            <input
              id="content-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              maxLength={150}
              placeholder="Ex.: Tutorial de transições no CapCut"
              autoFocus
              required
            />
          </div>

          <div className="idea-form-row">
            <div className="form-group">
              <label htmlFor="content-etapa">Etapa</label>
              <select id="content-etapa" value={etapa} onChange={(e) => setEtapa(e.target.value as ContentStage)}>
                {CREATABLE_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {CONTENT_STAGE_LABELS[stage]}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="content-plataforma">Plataforma</label>
              <select
                id="content-plataforma"
                value={plataforma}
                onChange={(e) => setPlataforma(e.target.value as Platform | "")}
              >
                <option value="">Não definida</option>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="content-formato">Formato</label>
              <select
                id="content-formato"
                value={formato}
                onChange={(e) => setFormato(e.target.value as ContentFormat | "")}
              >
                <option value="">Não definido</option>
                {CONTENT_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {CONTENT_FORMAT_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={closeIfIdle} disabled={isSaving}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              {isSaving ? "Criando..." : "Criar conteúdo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
