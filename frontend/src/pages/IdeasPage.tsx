import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Crown,
  Hash,
  Lightbulb,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { IdeaFormModal } from "../components/ideas/IdeaFormModal";
import { useAuth } from "../context/AuthContext";
import { useLayoutContext } from "../layouts/layoutContext";
import { deleteIdeaApi, getIdeasApi, isPlanLimitError, updateIdeaApi } from "../api/backend";
import type { Idea, IdeaStatus, IdeasResponse, Platform } from "../types";
import { IDEA_STATUS_LABELS, PLATFORMS, PLATFORM_LABELS, formatRelativeDate } from "../utils/content";

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
  const { showToast, openPlansModal } = useLayoutContext();

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

  const toggleArchive = async (idea: Idea) => {
    const archiving = idea.status !== "ARQUIVADA";
    setBusyId(idea.id);
    try {
      await updateIdeaApi(idea.id, { status: archiving ? "ARQUIVADA" : "NOVA" }, token);
      showToast("success", archiving ? "Ideia arquivada." : "Ideia restaurada.");
      await loadIdeas();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao atualizar ideia");
      if (isPlanLimitError(err)) openPlansModal();
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
  const usagePercent = uso?.limite ? Math.min(100, Math.round((uso.ideiasAtivas / uso.limite) * 100)) : 0;
  const usageLevel = usagePercent >= 100 ? "is-full" : usagePercent >= 80 ? "is-warning" : "";
  const hasFilters = Boolean(plataforma || tag || busca);
  const ideias = data?.ideias ?? [];

  return (
    <div className="page">
      <PageHeader
        icon={Lightbulb}
        title="Ideias"
        description="Capture ideias, ganchos e legendas antes que elas escapem."
        actions={
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={18} /> Nova ideia
          </button>
        }
      />

      {uso && uso.limite !== null && (
        <div className={`usage-bar ${usageLevel}`}>
          <div className="usage-bar-info">
            <span>
              <strong>{uso.ideiasAtivas}</strong> de {uso.limite} ideias ativas no plano Gratuito
            </span>
            <button className="usage-bar-upgrade" onClick={openPlansModal}>
              <Crown size={14} /> Ideias ilimitadas no Creator
            </button>
          </div>
          <div className="usage-bar-track">
            <div className="usage-bar-fill" style={{ width: `${usagePercent}%` }} />
          </div>
        </div>
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
                <div className="idea-card-badges">
                  {idea.plataforma && (
                    <span className={`idea-badge platform-${idea.plataforma.toLowerCase()}`}>
                      {PLATFORM_LABELS[idea.plataforma]}
                    </span>
                  )}
                  <span className={`idea-badge ${statusClass}`}>{IDEA_STATUS_LABELS[idea.status]}</span>
                </div>

                <button className="idea-card-title" onClick={() => openEdit(idea)}>
                  {idea.titulo}
                </button>

                {(idea.gancho || idea.descricao) && (
                  <p className="idea-card-excerpt">{idea.gancho || idea.descricao}</p>
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
