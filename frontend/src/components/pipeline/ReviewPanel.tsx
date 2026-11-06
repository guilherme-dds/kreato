import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleDot, MessageSquare, Pencil, RotateCcw, Send, Trash2, Undo2, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useLayoutContext } from "../../layouts/layoutContext";
import {
  approveScriptApi,
  createCommentApi,
  deleteCommentApi,
  getCommentsApi,
  requestChangesApi,
  updateCommentApi,
} from "../../api/backend";
import type { CommentType, ContentComment, ContentPermissions, ContentStage } from "../../types";
import { CONTENT_STAGE_LABELS, formatDateTime, formatRelativeDate } from "../../utils/content";

const COMMENT_MAX = 2000;

const TYPE_LABELS: Record<CommentType, string> = {
  COMENTARIO: "Comentário",
  APROVACAO: "Roteiro aprovado",
  AJUSTE: "Ajuste pedido",
};

type ReviewMode = "aprovar" | "ajustes" | null;

interface ReviewPanelProps {
  contentId: number;
  stage: ContentStage;
  permissions: ContentPermissions;
  /** Quando preenchido, aprovar/pedir ajustes fica bloqueado com esta explicação (ex.: alterações não salvas) */
  reviewBlockedReason: string | null;
  /** Recarrega o conteúdo depois de aprovar/pedir ajustes (a etapa muda no servidor) */
  onContentChanged: () => Promise<void>;
}

export const ReviewPanel: React.FC<ReviewPanelProps> = ({
  contentId,
  stage,
  permissions,
  reviewBlockedReason,
  onContentChanged,
}) => {
  const { token } = useAuth();
  const { showToast } = useLayoutContext();

  const [comments, setComments] = useState<ContentComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const [mode, setMode] = useState<ReviewMode>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);

  const loadComments = useCallback(async () => {
    setLoadError(null);
    try {
      setComments(await getCommentsApi(contentId, token));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Erro ao carregar comentários");
    } finally {
      setIsLoading(false);
    }
  }, [contentId, token]);

  // Recarrega também quando a etapa muda (aprovações e ajustes geram comentários no servidor)
  useEffect(() => {
    loadComments();
  }, [loadComments, stage]);

  // Fecha o formulário de revisão se a etapa mudou e a ação deixou de valer
  useEffect(() => {
    if (mode === "aprovar" && !permissions.aprovarRoteiro) setMode(null);
    if (mode === "ajustes" && !permissions.solicitarAjustes) setMode(null);
  }, [mode, permissions.aprovarRoteiro, permissions.solicitarAjustes]);

  const replaceComment = (updated: ContentComment) =>
    setComments((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));

  const sendComment = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const texto = draft.trim();
    if (!texto || isSending) return;
    setIsSending(true);
    try {
      const created = await createCommentApi(contentId, texto, token);
      setComments((prev) => [...prev, created]);
      setDraft("");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao enviar comentário");
    } finally {
      setIsSending(false);
    }
  };

  const toggleResolved = async (comment: ContentComment) => {
    setBusyId(comment.id);
    try {
      replaceComment(await updateCommentApi(comment.id, { resolvido: !comment.resolvido }, token));
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao atualizar comentário");
    } finally {
      setBusyId(null);
    }
  };

  const saveEdit = async (comment: ContentComment) => {
    const texto = editText.trim();
    if (!texto) return;
    if (texto === comment.texto) {
      setEditingId(null);
      return;
    }
    setBusyId(comment.id);
    try {
      replaceComment(await updateCommentApi(comment.id, { texto }, token));
      setEditingId(null);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao editar comentário");
    } finally {
      setBusyId(null);
    }
  };

  const removeComment = async (comment: ContentComment) => {
    if (!window.confirm("Excluir este comentário?")) return;
    setBusyId(comment.id);
    try {
      await deleteCommentApi(comment.id, token);
      setComments((prev) => prev.filter((c) => c.id !== comment.id));
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao excluir comentário");
    } finally {
      setBusyId(null);
    }
  };

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mode || isReviewing || reviewBlockedReason) return;
    const texto = reviewNote.trim();
    if (mode === "ajustes" && !texto) {
      showToast("info", "Descreva o que precisa ser ajustado.");
      return;
    }
    setIsReviewing(true);
    try {
      const message =
        mode === "aprovar" ? await approveScriptApi(contentId, texto, token) : await requestChangesApi(contentId, texto, token);
      showToast("success", message);
      setMode(null);
      setReviewNote("");
      await Promise.all([onContentChanged(), loadComments()]);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao registrar a revisão");
    } finally {
      setIsReviewing(false);
    }
  };

  const openCount = comments.filter((c) => !c.resolvido).length;
  const resolvedCount = comments.length - openCount;
  const visible = showResolved ? comments : comments.filter((c) => !c.resolvido);
  const canReview = permissions.aprovarRoteiro || permissions.solicitarAjustes;

  return (
    <section className="editor-panel review-panel">
      <div className="review-panel-header">
        <h3>
          <MessageSquare size={13} /> Revisão
        </h3>
        {openCount > 0 && <span className="review-open-count">{openCount} em aberto</span>}
      </div>

      {canReview && (
        <div className="review-actions">
          {mode === null ? (
            <>
              {permissions.aprovarRoteiro && (
                <button
                  className="btn btn-sm review-btn-approve"
                  onClick={() => setMode("aprovar")}
                  disabled={!!reviewBlockedReason}
                >
                  <CheckCircle2 size={15} /> Aprovar roteiro
                </button>
              )}
              {permissions.solicitarAjustes && (
                <button
                  className="btn btn-sm review-btn-changes"
                  onClick={() => setMode("ajustes")}
                  disabled={!!reviewBlockedReason}
                >
                  <RotateCcw size={15} /> Pedir ajustes
                </button>
              )}
              {reviewBlockedReason && <p className="review-hint">{reviewBlockedReason}</p>}
            </>
          ) : (
            <form className="review-form" onSubmit={submitReview}>
              <label htmlFor="review-note">
                {mode === "aprovar"
                  ? "Observação para a equipe (opcional)"
                  : stage === "GRAVACAO"
                    ? "O que precisa mudar? O conteúdo volta para Roteiro."
                    : "O que precisa mudar no roteiro?"}
              </label>
              <textarea
                id="review-note"
                rows={3}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                maxLength={COMMENT_MAX}
                placeholder={mode === "aprovar" ? "Ex.: ótimo gancho, pode gravar!" : "Ex.: encurtar a introdução e reforçar o CTA"}
                autoFocus
              />
              <div className="review-form-actions">
                <button
                  type="button"
                  className="idea-action"
                  onClick={() => {
                    setMode(null);
                    setReviewNote("");
                  }}
                  disabled={isReviewing}
                  title="Cancelar"
                  aria-label="Cancelar"
                >
                  <X size={16} />
                </button>
                <button
                  type="submit"
                  className={`btn btn-sm ${mode === "aprovar" ? "review-btn-approve" : "review-btn-changes"}`}
                  disabled={isReviewing || !!reviewBlockedReason || (mode === "ajustes" && !reviewNote.trim())}
                >
                  {mode === "aprovar" ? (
                    <>
                      <CheckCircle2 size={15} /> {isReviewing ? "Aprovando..." : "Aprovar e enviar para gravação"}
                    </>
                  ) : (
                    <>
                      <RotateCcw size={15} /> {isReviewing ? "Enviando..." : "Pedir ajustes"}
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="calendar-panel-empty">Carregando comentários...</p>
      ) : loadError ? (
        <p className="calendar-panel-empty">
          {loadError}{" "}
          <button className="review-link" onClick={loadComments}>
            Tentar de novo
          </button>
        </p>
      ) : visible.length === 0 ? (
        <p className="calendar-panel-empty">
          {comments.length === 0
            ? "Nenhum comentário ainda. Use este espaço para alinhar o roteiro com a equipe."
            : "Tudo resolvido por aqui."}
        </p>
      ) : (
        <ul className="review-list">
          {visible.map((comment) => {
            const isEditing = editingId === comment.id;
            const isBusy = busyId === comment.id;
            return (
              <li
                key={comment.id}
                className={`review-item type-${comment.tipo.toLowerCase()} ${comment.resolvido ? "is-resolved" : ""}`}
              >
                <div className="review-item-head">
                  <span className="review-avatar" aria-hidden="true">
                    {comment.autor?.nome?.charAt(0).toUpperCase() ?? "?"}
                  </span>
                  <span className="review-author">{comment.autor?.nome ?? "Membro removido"}</span>
                  {comment.tipo !== "COMENTARIO" && <span className="review-type">{TYPE_LABELS[comment.tipo]}</span>}
                  <time className="review-date" dateTime={comment.criadoEm} title={formatDateTime(comment.criadoEm)}>
                    {formatRelativeDate(comment.criadoEm)} · {CONTENT_STAGE_LABELS[comment.etapa]}
                  </time>
                </div>

                {isEditing ? (
                  <div className="review-edit">
                    <textarea
                      rows={3}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      maxLength={COMMENT_MAX}
                      aria-label="Editar comentário"
                      autoFocus
                    />
                    <div className="review-form-actions">
                      <button className="idea-action" onClick={() => setEditingId(null)} disabled={isBusy} title="Cancelar">
                        <X size={16} />
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => saveEdit(comment)}
                        disabled={isBusy || !editText.trim()}
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="review-text">{comment.texto}</p>
                )}

                {!isEditing && (
                  <div className="review-item-footer">
                    {comment.resolvido && comment.resolvidoPor && (
                      <span className="review-resolved-by">
                        <CheckCircle2 size={12} /> Resolvido por {comment.resolvidoPor.nome}
                      </span>
                    )}
                    <div className="review-item-actions">
                      {comment.podeResolver && comment.tipo !== "APROVACAO" && (
                        <button
                          className="idea-action"
                          onClick={() => toggleResolved(comment)}
                          disabled={isBusy}
                          title={comment.resolvido ? "Reabrir" : "Marcar como resolvido"}
                          aria-label={comment.resolvido ? "Reabrir comentário" : "Marcar comentário como resolvido"}
                        >
                          {comment.resolvido ? <Undo2 size={14} /> : <CircleDot size={14} />}
                        </button>
                      )}
                      {comment.podeEditar && (
                        <button
                          className="idea-action"
                          onClick={() => {
                            setEditingId(comment.id);
                            setEditText(comment.texto);
                          }}
                          disabled={isBusy}
                          title="Editar"
                          aria-label="Editar comentário"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {comment.podeExcluir && (
                        <button
                          className="idea-action"
                          onClick={() => removeComment(comment)}
                          disabled={isBusy}
                          title="Excluir"
                          aria-label="Excluir comentário"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {resolvedCount > 0 && (
        <button className="review-link" onClick={() => setShowResolved((v) => !v)}>
          {showResolved ? "Ocultar resolvidos" : `Mostrar resolvidos (${resolvedCount})`}
        </button>
      )}

      <form className="review-compose" onSubmit={sendComment}>
        <textarea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") sendComment();
          }}
          maxLength={COMMENT_MAX}
          placeholder="Escreva um comentário... (Ctrl+Enter envia)"
          aria-label="Novo comentário"
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={isSending || !draft.trim()}
          title="Enviar comentário"
          aria-label="Enviar comentário"
        >
          <Send size={15} />
        </button>
      </form>
    </section>
  );
};
