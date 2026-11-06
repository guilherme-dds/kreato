import React, { useEffect, useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLayoutContext } from "../../layouts/layoutContext";
import { createIdeaApi, isPlanLimitError, planLimitResource, updateIdeaApi } from "../../api/backend";
import type { Idea, IdeaInput, IdeaStatus, Platform } from "../../types";
import { IDEA_STATUSES, IDEA_STATUS_LABELS, PLATFORMS, PLATFORM_LABELS, parseTagsInput } from "../../utils/content";

// Espelham os limites validados pelo IdeaController
const TITLE_MAX = 150;
const HOOK_MAX = 2000;
const DESCRIPTION_MAX = 5000;
const CAPTION_MAX = 2200;

interface IdeaFormModalProps {
  /** Ideia em edição; null para criar uma nova */
  idea: Idea | null;
  onClose: () => void;
  onSaved: (idea: Idea, created: boolean) => void;
}

export const IdeaFormModal: React.FC<IdeaFormModalProps> = ({ idea, onClose, onSaved }) => {
  const { token } = useAuth();
  const { showToast, openPlans } = useLayoutContext();
  const isEditing = idea !== null;

  const [titulo, setTitulo] = useState(idea?.titulo ?? "");
  const [plataforma, setPlataforma] = useState<Platform | "">(idea?.plataforma ?? "");
  const [status, setStatus] = useState<IdeaStatus>(idea?.status ?? "NOVA");
  const [gancho, setGancho] = useState(idea?.gancho ?? "");
  const [descricao, setDescricao] = useState(idea?.descricao ?? "");
  const [legenda, setLegenda] = useState(idea?.legenda ?? "");
  const [tagsInput, setTagsInput] = useState(idea?.tags.join(", ") ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const tags = parseTagsInput(tagsInput);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSaving) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) {
      setFormError("Dê um título para a ideia.");
      return;
    }

    const input: IdeaInput = {
      titulo: titulo.trim(),
      plataforma: plataforma || null,
      gancho,
      descricao,
      legenda,
      tags,
      ...(isEditing ? { status } : {}),
    };

    setIsSaving(true);
    setFormError(null);
    try {
      const saved = isEditing ? await updateIdeaApi(idea.id, input, token) : await createIdeaApi(input, token);
      onSaved(saved, !isEditing);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar ideia";
      if (isPlanLimitError(err)) {
        showToast("error", message);
        onClose();
        openPlans(planLimitResource(err));
        return;
      }
      setFormError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const closeIfIdle = () => {
    if (!isSaving) onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeIfIdle()}>
      <div className="modal-card idea-modal" role="dialog" aria-modal="true" aria-labelledby="idea-modal-title">
        <button className="modal-close-btn" onClick={closeIfIdle} aria-label="Fechar">
          <X size={18} />
        </button>

        <div className="idea-modal-header">
          <div className="page-header-icon">
            <Lightbulb size={20} />
          </div>
          <h2 id="idea-modal-title">{isEditing ? "Editar ideia" : "Nova ideia"}</h2>
        </div>

        <form className="idea-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="idea-titulo">Título *</label>
            <input
              id="idea-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              maxLength={TITLE_MAX}
              placeholder="Ex.: 3 erros que todo iniciante comete na edição"
              autoFocus
              required
            />
          </div>

          <div className="idea-form-row">
            <div className="form-group">
              <label htmlFor="idea-plataforma">Plataforma</label>
              <select
                id="idea-plataforma"
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

            {isEditing && (
              <div className="form-group">
                <label htmlFor="idea-status">Status</label>
                <select id="idea-status" value={status} onChange={(e) => setStatus(e.target.value as IdeaStatus)}>
                  {IDEA_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {IDEA_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="idea-gancho">Gancho</label>
            <textarea
              id="idea-gancho"
              rows={2}
              value={gancho}
              onChange={(e) => setGancho(e.target.value)}
              maxLength={HOOK_MAX}
              placeholder="A frase dos primeiros 3 segundos que prende a atenção"
            />
          </div>

          <div className="form-group">
            <label htmlFor="idea-descricao">Descrição / rascunho</label>
            <textarea
              id="idea-descricao"
              rows={4}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              maxLength={DESCRIPTION_MAX}
              placeholder="Tópicos, referências, estrutura do vídeo..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="idea-legenda" className="label-with-counter">
              Legenda
              <span className={`field-counter ${legenda.length > CAPTION_MAX * 0.9 ? "is-warning" : ""}`}>
                {legenda.length}/{CAPTION_MAX}
              </span>
            </label>
            <textarea
              id="idea-legenda"
              rows={3}
              value={legenda}
              onChange={(e) => setLegenda(e.target.value)}
              maxLength={CAPTION_MAX}
              placeholder="Rascunho da legenda do post"
            />
          </div>

          <div className="form-group">
            <label htmlFor="idea-tags">Tags</label>
            <input
              id="idea-tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Separe por vírgulas: dicas, edição, #reels"
            />
            {tags.length > 0 && (
              <div className="idea-tags">
                {tags.map((t) => (
                  <span key={t} className="idea-tag">
                    #{t}
                  </span>
                ))}
              </div>
            )}
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
              {isSaving ? "Salvando..." : isEditing ? "Salvar alterações" : "Criar ideia"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
