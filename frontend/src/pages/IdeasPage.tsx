import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  ArchiveRestore,
  Hash,
  Lightbulb,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SquareKanban,
  Trash2,
  X,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { UsageBar } from "../components/UsageBar";
import { IdeaFormModal } from "../components/ideas/IdeaFormModal";
import { useAuth } from "../context/AuthContext";
import { useLayoutContext } from "../layouts/layoutContext";
import {
  ApiError,
  convertIdeaApi,
  deleteIdeaApi,
  getIdeasApi,
  isPlanLimitError, planLimitResource,
  updateIdeaApi,
} from "../api/backend";
import type { Idea, IdeaStatus, IdeasResponse, Platform } from "../types";
import { IDEA_STATUS_LABELS, PLATFORMS, PLATFORM_LABELS, formatRelativeDate, sceneNumber } from "../utils/content";

type StatusTab = "" | IdeaStatus;

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: "", label: "Ativas" },
  { value: "NOVA", label: "Novas" },
  { value: "EM_DESENVOLVIMENTO", label: "Em desenvolvimento" },
  { value: "ARQUIVADA", label: "Arquivadas" },
];

const SEARCH_DEBOUNCE_MS = 350;

export const IdeasPage: React.FC = () => {
  const { token, user } = useAuth();
  const { showToast, openPlans } = useLayoutContext();
  const navigate = useNavigate();

  const [status, setStatus] = useState<StatusTab>("");
  const [plataforma, setPlataforma] = useState<Platform | "">("");
  const [tag, setTag] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [busca, setBusca] = useState("");

  const [data, setData] = useState<IdeasResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingIdea, setEditingIdea] = useState<Idea | null>(null);

  // Ignora respostas de requisições antigas quando os filtros mudam rapidamente
  const requestId = useRef(0);

  useEffect(() => {
    const timeout = setTimeout(() => setBusca(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const loadIdeas = useCallback(async () => {
    const current = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const response = await getIdeasApi({ status, plataforma, tag, busca }, token);
      if (current === requestId.current) setData(response);
    } catch (err) {
      if (current === requestId.current) {
        setError(err instanceof Error ? err.message : "Erro ao carregar ideias");
      }
    } finally {
      if (current === requestId.current) setIsLoading(false);
    }
  }, [status, plataforma, tag, busca, token]);

  useEffect(() => {
    loadIdeas();
  }, [loadIdeas]);

  const openCreate = () => {
    setEditingIdea(null);
    setIsFormOpen(true);
  };

  const openEdit = (idea: Idea) => {
    setEditingIdea(idea);
    setIsFormOpen(true);
  };

  const handleSaved = (idea: Idea, created: boolean) => {
    setIsFormOpen(false);
    showToast("success", created ? `Ideia "${idea.titulo}" criada!` : "Ideia atualizada.");
    loadIdeas();
  };

  /** Leva a ideia para o pipeline e abre o editor de roteiro do novo conteúdo */
  const handleConvert = async (idea: Idea) => {
    setBusyId(idea.id);
    try {
      const conteudo = await convertIdeaApi(idea.id, token);
      showToast("success", `"${idea.titulo}" entrou no pipeline na etapa Roteiro.`);
      navigate(`/pipeline/${conteudo.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "IDEA_ALREADY_CONVERTED") {
        const conteudoId = err.data.conteudoId;
        showToast("info", "Esta ideia já está no pipeline.");
        navigate(typeof conteudoId === "number" ? `/pipeline/${conteudoId}` : "/pipeline");
        return;
      }
      showToast("error", err instanceof Error ? err.message : "Erro ao levar ideia para o pipeline");
      if (isPlanLimitError(err)) openPlans(planLimitResource(err));
    } finally {
      setBusyId(null);
    }
  };

  const toggleArchive = async (idea: Idea) => {
    const archiving = idea.status !== "ARQUIVADA";
    setBusyId(idea.id);
    try {
      await updateIdeaApi(idea.id, { status: archiving ? "ARQUIVADA" : "NOVA" }, token);
      showToast("success", archiving ? "Ideia arquivada." : "Ideia restaurada.");
      await loadIdeas();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao atualizar ideia");
      if (isPlanLimitError(err)) openPlans(planLimitResource(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (idea: Idea) => {
    if (!window.confirm(`Excluir a ideia "${idea.titulo}"? Essa ação não pode ser desfeita.`)) return;
    setBusyId(idea.id);
    try {
      await deleteIdeaApi(idea.id, token);
      showToast("success", "Ideia excluída.");
      await loadIdeas();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao excluir ideia");
    } finally {
      setBusyId(null);
    }
  };

  const clearFilters = () => {
    setPlataforma("");
    setTag("");
    setSearchInput("");
    setBusca("");
  };

  const uso = data?.uso;
  const hasFilters = Boolean(plataforma || tag || busca);
  const ideias = data?.ideias ?? [];

  return (
    <div className="page">
      <PageHeader
        title="Ideias"
        description="Capture ideias, ganchos e legendas antes que elas escapem."
        actions={
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={18} /> Nova ideia
          </button>
        }
      />

      {uso && uso.limite !== null && (
        <UsageBar
          used={uso.ideiasAtivas}
          limit={uso.limite}
          label="ideias ativas no plano Gratuito"
          upgradeLabel="Ideias ilimitadas no Creator"
          onUpgrade={() => openPlans()}
        />
      )}

      <div className="ideas-toolbar">
        <div className="ideas-tabs" role="tablist" aria-label="Filtrar por status">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value || "ativas"}
              role="tab"
              aria-selected={status === tab.value}
              className={`ideas-tab ${status === tab.value ? "active" : ""}`}
              onClick={() => setStatus(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="ideas-filters">
          <div className="ideas-search">
            <Search size={16} />
            <input
              type="search"
              placeholder="Buscar por título, gancho ou descrição"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Buscar ideias"
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
          {tag && (
            <button className="tag-filter-chip" onClick={() => setTag("")} title="Remover filtro de tag">
              <Hash size={13} />
              {tag}
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {isLoading && !data ? (
        <div className="catalog-loading">
          <RefreshCw className="spinning-icon" size={28} />
          <span>Carregando ideias...</span>
        </div>
      ) : error ? (
        <div className="catalog-empty">
          <div className="empty-icon-wrapper">
            <Lightbulb size={28} />
          </div>
          <h3>Não foi possível carregar suas ideias</h3>
          <p>{error}</p>
          <button className="btn btn-sm ideas-empty-action" onClick={loadIdeas}>
            <RefreshCw size={14} /> Tentar novamente
          </button>
        </div>
      ) : ideias.length === 0 ? (
        <div className="catalog-empty">
          <div className="empty-icon-wrapper">
            <Lightbulb size={28} />
          </div>
          {hasFilters ? (
            <>
              <h3>Nenhuma ideia encontrada</h3>
              <p>Tente outros filtros ou termos de busca.</p>
              <button className="btn btn-sm ideas-empty-action" onClick={clearFilters}>
                Limpar filtros
              </button>
            </>
          ) : status === "ARQUIVADA" ? (
            <>
              <h3>Nenhuma ideia arquivada</h3>
              <p>Ideias arquivadas não contam no limite do seu plano.</p>
            </>
          ) : (
            <>
              <h3>Seu banco de ideias está vazio</h3>
              <p>Anote a próxima ideia de vídeo, um gancho ou uma legenda que surgiu agora.</p>
              <button className="btn btn-primary btn-sm ideas-empty-action" onClick={openCreate}>
                <Plus size={16} /> Criar primeira ideia
              </button>
            </>
          )}
        </div>
      ) : (
        <div className={`ideas-grid ${isLoading ? "is-refreshing" : ""}`}>
          {ideias.map((idea) => {
            // O backend também permite que DONO/GESTOR excluam; a UI de equipe chega nos commits de times
            const canDelete = idea.autor?.id === user?.id;
            const isBusy = busyId === idea.id;
            const statusClass = `status-${idea.status.toLowerCase()}`;
            return (
              <article key={idea.id} className={`idea-card ${statusClass}`}>
                <header className="idea-card-head">
                  <span className="idea-card-number timecode">IDEIA {sceneNumber(idea.id)}</span>
                  {idea.plataforma && <span className="idea-card-platform">{PLATFORM_LABELS[idea.plataforma]}</span>}
                  <span className={`idea-badge ${statusClass}`}>{IDEA_STATUS_LABELS[idea.status]}</span>
                </header>

                <button className="idea-card-title" onClick={() => openEdit(idea)}>
                  {idea.titulo}
                </button>

                {idea.gancho ? (
                  <blockquote className="idea-card-hook">{idea.gancho}</blockquote>
                ) : (
                  idea.descricao && <p className="idea-card-excerpt">{idea.descricao}</p>
                )}

                {idea.tags.length > 0 && (
                  <div className="idea-tags">
                    {idea.tags.map((t) => (
                      <button
                        key={t}
                        className={`idea-tag ${tag === t ? "active" : ""}`}
                        onClick={() => setTag(t)}
                        title={`Filtrar por #${t}`}
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                )}

                <footer className="idea-card-footer">
                  <span className="idea-card-meta">
                    {idea.autor?.nome ? `${idea.autor.nome.split(" ")[0]} · ` : ""}
                    {formatRelativeDate(idea.atualizadoEm)}
                  </span>
                  <div className="idea-card-actions">
                    {idea.status !== "ARQUIVADA" && (
                      <button
                        className="idea-action"
                        onClick={() => handleConvert(idea)}
                        title="Levar para o pipeline"
                        disabled={isBusy}
                      >
                        <SquareKanban size={15} />
                      </button>
                    )}
                    <button className="idea-action" onClick={() => openEdit(idea)} title="Editar" disabled={isBusy}>
                      <Pencil size={15} />
                    </button>
                    <button
                      className="idea-action"
                      onClick={() => toggleArchive(idea)}
                      title={idea.status === "ARQUIVADA" ? "Restaurar" : "Arquivar"}
                      disabled={isBusy}
                    >
                      {idea.status === "ARQUIVADA" ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                    </button>
                    {canDelete && (
                      <button
                        className="idea-action danger"
                        onClick={() => handleDelete(idea)}
                        title="Excluir"
                        disabled={isBusy}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {isFormOpen && <IdeaFormModal idea={editingIdea} onClose={() => setIsFormOpen(false)} onSaved={handleSaved} />}
    </div>
  );
};
