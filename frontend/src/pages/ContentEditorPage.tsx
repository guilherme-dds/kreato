import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, CheckCircle2, ExternalLink, Lightbulb, Lock, RefreshCw, Save, SquareKanban, Trash2, Wand2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLayoutContext } from "../layouts/layoutContext";
import { AttachmentsPanel } from "../components/pipeline/AttachmentsPanel";
import { MetricsPanel } from "../components/pipeline/MetricsPanel";
import { ReviewPanel } from "../components/pipeline/ReviewPanel";
import { deleteContentApi, getContentApi, isPlanLimitError, planLimitResource, moveContentApi, updateContentApi } from "../api/backend";
import type { ContentDetail, ContentFormat, ContentInput, ContentStage, Platform } from "../types";
import {
  CONTENT_FORMATS,
  CONTENT_FORMAT_LABELS,
  CONTENT_STAGES,
  CONTENT_STAGE_LABELS,
  PLATFORMS,
  formatDateTime,
  PLATFORM_LABELS,
  countWords,
  estimateSpeakingTime,
  formatRelativeDate,
  fromDateTimeLocal,
  parseHashtagsInput,
  toDateTimeLocal,
} from "../utils/content";

const CAPTION_MAX = 2200;
const SCRIPT_MAX = 50_000;
const MAX_HASHTAGS = 30;

const SCRIPT_TEMPLATE = `GANCHO (0–3s)
Frase que prende a atenção logo de cara.

CONTEXTO
Por que esse assunto importa para quem está assistindo.

DESENVOLVIMENTO
1.
2.
3.

CTA
O que a pessoa deve fazer agora (seguir, comentar, salvar).`;

interface EditorForm {
  titulo: string;
  roteiro: string;
  legenda: string;
  hashtags: string;
  plataforma: Platform | "";
  formato: ContentFormat | "";
  dataPublicacao: string;
  urlPublicacao: string;
}

function toForm(content: ContentDetail): EditorForm {
  return {
    titulo: content.titulo,
    roteiro: content.roteiro ?? "",
    legenda: content.legenda ?? "",
    hashtags: content.hashtags.map((tag) => `#${tag}`).join(" "),
    plataforma: content.plataforma ?? "",
    formato: content.formato ?? "",
    dataPublicacao: toDateTimeLocal(content.dataPublicacao),
    urlPublicacao: content.urlPublicacao ?? "",
  };
}

function isSameForm(a: EditorForm, b: EditorForm): boolean {
  return (Object.keys(a) as (keyof EditorForm)[]).every((key) => a[key] === b[key]);
}

/** Explica por que os textos estão travados para o papel atual */
function readOnlyReason(content: ContentDetail): string {
  const { papel } = content.permissoes;
  if (papel === "ROTEIRISTA") {
    return content.roteiroAprovadoEm
      ? "O roteiro já foi aprovado. Para mudar o texto, peça a um gestor que solicite ajustes."
      : "Este conteúdo está em produção: só gestores alteram o texto nesta etapa.";
  }
  return "Seu papel neste workspace não edita textos. Deixe sugestões nos comentários da revisão.";
}

export const ContentEditorPage: React.FC = () => {
  const { id } = useParams();
  const contentId = Number(id);
  const navigate = useNavigate();
  const { token } = useAuth();
  const { showToast, openPlans } = useLayoutContext();

  const [content, setContent] = useState<ContentDetail | null>(null);
  const [form, setForm] = useState<EditorForm | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const dateInputRef = useRef<HTMLInputElement>(null);

  const isDirty = content !== null && form !== null && !isSameForm(form, toForm(content));
  const canEditText = content?.permissoes.editarTexto ?? false;
  const canEditPublication = content?.permissoes.editarPublicacao ?? false;
  const hashtags = form ? parseHashtagsInput(form.hashtags) : [];
  const words = form ? countWords(form.roteiro) : 0;

  useEffect(() => {
    if (!Number.isInteger(contentId) || contentId <= 0) {
      setLoadError("Conteúdo não encontrado.");
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    getContentApi(contentId, token)
      .then((loaded) => {
        if (cancelled) return;
        setContent(loaded);
        setForm(toForm(loaded));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Erro ao carregar conteúdo");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contentId, token]);

  // Avisa antes de fechar/recarregar a aba com alterações não salvas
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const updateField = <K extends keyof EditorForm>(key: K, value: EditorForm[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setJustSaved(false);
  };

  const save = useCallback(async () => {
    if (!content || !form || isSaving || !isDirty) return;
    const { editarTexto, editarPublicacao } = content.permissoes;
    if (editarTexto && !form.titulo.trim()) {
      showToast("error", "O título não pode ficar vazio.");
      return;
    }

    // Envia só os grupos de campos que o papel pode alterar (o backend recusa o resto)
    const input: Partial<ContentInput> = {};
    if (editarTexto) {
      Object.assign(input, {
        titulo: form.titulo.trim(),
        roteiro: form.roteiro,
        legenda: form.legenda,
        hashtags: parseHashtagsInput(form.hashtags),
        plataforma: form.plataforma || null,
        formato: form.formato || null,
      });
    }
    if (editarPublicacao) {
      Object.assign(input, {
        dataPublicacao: fromDateTimeLocal(form.dataPublicacao),
        urlPublicacao: form.urlPublicacao.trim() || null,
      });
    }
    if (Object.keys(input).length === 0) return;

    setIsSaving(true);
    try {
      const saved = await updateContentApi(content.id, input, token);
      setContent(saved);
      setForm(toForm(saved));
      setJustSaved(true);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao salvar conteúdo");
    } finally {
      setIsSaving(false);
    }
  }, [content, form, isDirty, isSaving, showToast, token]);

  /** Recarrega do servidor após uma revisão (etapa e aprovação mudam); preserva o que está sendo editado */
  const reloadContent = useCallback(async () => {
    try {
      const loaded = await getContentApi(contentId, token);
      setContent(loaded);
      setForm((prev) => (prev && isDirty ? prev : toForm(loaded)));
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao recarregar conteúdo");
    }
  }, [contentId, isDirty, showToast, token]);

  // Ctrl/Cmd + S salva sem sair do editor
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [save]);

  const changeStage = async (stage: ContentStage) => {
    if (!content || !form || stage === content.etapa || isMoving) return;
    if (!content.permissoes.moverPara.includes(stage)) {
      showToast(
        "error",
        content.etapa === "ROTEIRO" && stage === "GRAVACAO"
          ? "Use “Aprovar roteiro” na revisão para enviar à gravação (somente gestores)."
          : `Seu papel não permite mover este conteúdo para ${CONTENT_STAGE_LABELS[stage]}.`
      );
      return;
    }

    const dataPublicacao = fromDateTimeLocal(form.dataPublicacao);
    if (stage === "AGENDADO" && !dataPublicacao) {
      showToast("info", "Defina a data de publicação para agendar.");
      dateInputRef.current?.focus();
      return;
    }

    setIsMoving(true);
    try {
      // Só envia a data se preenchida: limpar o campo sem salvar não deve apagar a data já salva
      const sendDate = dataPublicacao && content.permissoes.editarPublicacao;
      const moved = await moveContentApi(content.id, { etapa: stage, ...(sendDate ? { dataPublicacao } : {}) }, token);
      setContent(moved);
      // Mantém o que está sendo editado; só a data vem do servidor (publicar sem data assume agora)
      setForm((prev) => (prev ? { ...prev, dataPublicacao: toDateTimeLocal(moved.dataPublicacao) } : prev));
      showToast("success", stage === "PUBLICADO" ? "Conteúdo publicado! 🎉" : `Movido para ${CONTENT_STAGE_LABELS[stage]}.`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao mudar etapa");
      // Com alterações não salvas, fica no editor: o toast já explica o limite
      if (isPlanLimitError(err) && !isDirty) openPlans(planLimitResource(err));
    } finally {
      setIsMoving(false);
    }
  };

  const handleDelete = async () => {
    if (!content) return;
    if (!window.confirm(`Excluir "${content.titulo}"? O roteiro também será apagado.`)) return;
    try {
      await deleteContentApi(content.id, token);
      showToast("success", "Conteúdo excluído.");
      navigate("/pipeline");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao excluir conteúdo");
    }
  };

  const goBack = () => {
    if (isDirty && !window.confirm("Há alterações não salvas. Sair mesmo assim?")) return;
    navigate("/pipeline");
  };

  if (isLoading) {
    return (
      <div className="catalog-loading">
        <RefreshCw className="spinning-icon" size={28} />
        <span>Carregando roteiro...</span>
      </div>
    );
  }

  if (loadError || !content || !form) {
    return (
      <div className="page">
        <div className="catalog-empty">
          <div className="empty-icon-wrapper">
            <SquareKanban size={28} />
          </div>
          <h3>Não foi possível abrir este conteúdo</h3>
          <p>{loadError}</p>
          <Link to="/pipeline" className="btn btn-sm ideas-empty-action">
            <ArrowLeft size={14} /> Voltar para o pipeline
          </Link>
        </div>
      </div>
    );
  }

  const stageIndex = CONTENT_STAGES.indexOf(content.etapa);

  return (
    <div className="page page-wide editor-page">
      <div className="editor-topbar">
        <button className="editor-back" onClick={goBack}>
          <ArrowLeft size={16} /> Pipeline
        </button>
        <div className="editor-save-state">
          {isSaving ? (
            <span>Salvando...</span>
          ) : isDirty ? (
            <span className="is-dirty">Alterações não salvas</span>
          ) : justSaved ? (
            <span className="is-saved">
              <Check size={14} /> Salvo
            </span>
          ) : null}
          {(canEditText || canEditPublication) && (
            <button className="btn btn-primary btn-sm" onClick={save} disabled={!isDirty || isSaving} title="Ctrl+S">
              <Save size={15} /> Salvar
            </button>
          )}
        </div>
      </div>

      <nav className="stage-stepper" aria-label="Etapa do conteúdo">
        {CONTENT_STAGES.map((stage, index) => (
          <button
            key={stage}
            className={`stage-step ${index < stageIndex ? "is-done" : ""} ${index === stageIndex ? "is-current" : ""}`}
            onClick={() => changeStage(stage)}
            disabled={isMoving || (index !== stageIndex && !content.permissoes.moverPara.includes(stage))}
            aria-current={index === stageIndex ? "step" : undefined}
          >
            <span className="stage-step-dot">{index < stageIndex ? <Check size={12} /> : index + 1}</span>
            {CONTENT_STAGE_LABELS[stage]}
          </button>
        ))}
      </nav>

      {(content.roteiroAprovadoEm || !canEditText) && (
        <div className="editor-notices">
          {content.roteiroAprovadoEm && (
            <span className="editor-approved" title={formatDateTime(content.roteiroAprovadoEm)}>
              <CheckCircle2 size={14} />
              Roteiro aprovado{content.roteiroAprovadoPor ? ` por ${content.roteiroAprovadoPor.nome}` : ""}{" "}
              {formatRelativeDate(content.roteiroAprovadoEm)}
            </span>
          )}
          {!canEditText && (
            <span className="editor-readonly">
              <Lock size={14} /> {readOnlyReason(content)}
            </span>
          )}
        </div>
      )}

      <div className="editor-layout">
        <section className="editor-main">
          <input
            className="editor-title"
            value={form.titulo}
            onChange={(e) => updateField("titulo", e.target.value)}
            readOnly={!canEditText}
            maxLength={150}
            placeholder="Título do conteúdo"
            aria-label="Título"
          />

          <div className="editor-script">
            <div className="editor-script-toolbar">
              <span className="editor-script-label">Roteiro</span>
              <span className="editor-script-stats">
                {words} {words === 1 ? "palavra" : "palavras"} · ~{estimateSpeakingTime(words)} falando
              </span>
              {canEditText && !form.roteiro.trim() && (
                <button className="editor-template-btn" onClick={() => updateField("roteiro", SCRIPT_TEMPLATE)}>
                  <Wand2 size={14} /> Usar estrutura
                </button>
              )}
            </div>
            <textarea
              value={form.roteiro}
              onChange={(e) => updateField("roteiro", e.target.value)}
              readOnly={!canEditText}
              maxLength={SCRIPT_MAX}
              placeholder="Escreva o roteiro: gancho, desenvolvimento e chamada para ação..."
              aria-label="Roteiro"
            />
          </div>

          <ReviewPanel
            contentId={content.id}
            stage={content.etapa}
            permissions={content.permissoes}
            reviewBlockedReason={isDirty ? "Salve as alterações do roteiro antes de revisar." : null}
            onContentChanged={reloadContent}
          />

          <MetricsPanel contentId={content.id} stage={content.etapa} />
        </section>

        <aside className="editor-sidebar">
          <div className="editor-panel">
            <h3>Detalhes</h3>
            <div className="form-group">
              <label htmlFor="editor-plataforma">Plataforma</label>
              <select
                id="editor-plataforma"
                value={form.plataforma}
                disabled={!canEditText}
                onChange={(e) => updateField("plataforma", e.target.value as Platform | "")}
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
              <label htmlFor="editor-formato">Formato</label>
              <select
                id="editor-formato"
                value={form.formato}
                disabled={!canEditText}
                onChange={(e) => updateField("formato", e.target.value as ContentFormat | "")}
              >
                <option value="">Não definido</option>
                {CONTENT_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {CONTENT_FORMAT_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="editor-data">Data de publicação</label>
              <input
                id="editor-data"
                ref={dateInputRef}
                type="datetime-local"
                value={form.dataPublicacao}
                disabled={!canEditPublication}
                title={canEditPublication ? undefined : "Só gestores definem a data de publicação"}
                onChange={(e) => updateField("dataPublicacao", e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="editor-url">Link da publicação</label>
              <div className="editor-url-field">
                <input
                  id="editor-url"
                  type="url"
                  value={form.urlPublicacao}
                  disabled={!canEditPublication}
                  onChange={(e) => updateField("urlPublicacao", e.target.value)}
                  placeholder="https://..."
                />
                {content.urlPublicacao && (
                  <a href={content.urlPublicacao} target="_blank" rel="noreferrer" className="idea-action" title="Abrir">
                    <ExternalLink size={15} />
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="editor-panel">
            <h3>Publicação</h3>
            <div className="form-group">
              <label htmlFor="editor-legenda" className="label-with-counter">
                Legenda
                <span className={`field-counter ${form.legenda.length > CAPTION_MAX * 0.9 ? "is-warning" : ""}`}>
                  {form.legenda.length}/{CAPTION_MAX}
                </span>
              </label>
              <textarea
                id="editor-legenda"
                rows={5}
                value={form.legenda}
                readOnly={!canEditText}
                onChange={(e) => updateField("legenda", e.target.value)}
                maxLength={CAPTION_MAX}
                placeholder="Legenda do post"
              />
            </div>
            <div className="form-group">
              <label htmlFor="editor-hashtags" className="label-with-counter">
                Hashtags
                <span className={`field-counter ${hashtags.length >= MAX_HASHTAGS ? "is-warning" : ""}`}>
                  {hashtags.length}/{MAX_HASHTAGS}
                </span>
              </label>
              <textarea
                id="editor-hashtags"
                rows={2}
                value={form.hashtags}
                readOnly={!canEditText}
                onChange={(e) => updateField("hashtags", e.target.value)}
                placeholder="#dicas #edicao #reels"
              />
            </div>
          </div>

          <AttachmentsPanel contentId={content.id} />

          <div className="editor-panel editor-meta">
            {content.ideia && (
              <p>
                <Lightbulb size={14} /> Veio da ideia <Link to="/ideias">“{content.ideia.titulo}”</Link>
              </p>
            )}
            <p>
              Criado por {content.autor?.nome ?? "membro removido"} · atualizado {formatRelativeDate(content.atualizadoEm)}
            </p>
            {content.permissoes.excluir && (
              <button className="editor-delete" onClick={handleDelete}>
                <Trash2 size={14} /> Excluir conteúdo
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
