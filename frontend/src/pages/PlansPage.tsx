import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, Info, RefreshCw, Settings, ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLayoutContext } from "../layouts/layoutContext";
import { PageHeader } from "../components/PageHeader";
import { PlanCard } from "../components/billing/PlanCard";
import { usePlanActions } from "../components/billing/usePlanActions";
import { getUsageApi } from "../api/backend";
import type { PlanResource, UsageResponse } from "../types";
import { PLAN_LABELS } from "../utils/plans";
import { formatBytes } from "../utils/files";

const RESOURCE_LABELS: Record<PlanResource, string> = {
  ideias: "ideias ativas",
  conteudosAtivos: "conteúdos em produção",
  armazenamentoMB: "armazenamento de anexos",
  historicoMetricasDias: "histórico de métricas",
  membros: "membros da equipe",
};

const MB = 1024 * 1024;

interface UsageMeterProps {
  label: string;
  used: number;
  /** null = ilimitado */
  limit: number | null;
  format?: (value: number) => string;
  focused?: boolean;
  /** Texto no lugar do "de N" e sem barra (ex.: plano de uso individual) */
  note?: string;
}

const UsageMeter: React.FC<UsageMeterProps> = ({ label, used, limit, format = String, focused, note }) => {
  const hasBar = limit !== null && !note;
  const percent = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const level = !hasBar ? "" : percent >= 100 ? "is-full" : percent >= 80 ? "is-warning" : "";

  return (
    <li className={`usage-meter ${level} ${focused ? "is-focused" : ""}`}>
      <div className="usage-meter-info">
        <span>{label}</span>
        <strong>
          {format(used)}
          {note ? (
            <small> · {note}</small>
          ) : limit === null ? (
            <small> · ilimitado</small>
          ) : (
            <small> de {format(limit)}</small>
          )}
        </strong>
      </div>
      {hasBar && limit !== null && (
        <div
          className="usage-bar-track"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(used, limit)}
        >
          <div className="usage-bar-fill" style={{ width: `${percent}%` }} />
        </div>
      )}
    </li>
  );
};

export const PlansPage: React.FC = () => {
  const { token, user } = useAuth();
  const { showToast } = useLayoutContext();
  const location = useLocation();
  const navigate = useNavigate();
  const reason = (location.state as { motivo?: PlanResource } | null)?.motivo;

  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);

  const loadUsage = useCallback(async () => {
    setUsageError(null);
    try {
      setUsage(await getUsageApi(token));
    } catch (err) {
      setUsageError(err instanceof Error ? err.message : "Erro ao carregar o uso do plano");
    }
  }, [token]);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  // Após assinar/trocar/cancelar, os limites mudam: recarrega o uso e descarta o aviso de limite atingido
  const handlePlanChanged = useCallback(() => {
    loadUsage();
    navigate(location.pathname, { replace: true, state: null });
  }, [loadUsage, navigate, location.pathname]);

  const { catalog, catalogError, loadCatalog, currentPlan, pending, subscribe, activateMock, cancel, manage } = usePlanActions(
    showToast,
    handlePlanChanged
  );

  const workspacePlan = usage?.plano ?? currentPlan;

  return (
    <div className="page page-wide">
      <PageHeader
        title="Planos"
        description="Veja quanto do seu plano você já usa e escolha o que faz sentido para o seu ritmo."
      />

      {reason && (
        <div className="analytics-notice" role="status">
          <span>
            <AlertTriangle size={14} /> Você atingiu o limite de {RESOURCE_LABELS[reason]} do plano{" "}
            {PLAN_LABELS[workspacePlan]}. Faça upgrade para continuar sem travas.
          </span>
        </div>
      )}

      <section className="home-card">
        <header className="home-card-header">
          <h2>Uso {usage ? `em ${usage.workspace.nome}` : "do workspace"}</h2>
          {usage && <span className={`plans-chip plan-${usage.plano.toLowerCase()}`}>{PLAN_LABELS[usage.plano]}</span>}
        </header>

        {usageError ? (
          <div className="plans-state">
            <p>{usageError}</p>
            <button className="btn btn-sm btn-secondary" onClick={loadUsage}>
              <RefreshCw size={14} /> Tentar novamente
            </button>
          </div>
        ) : !usage ? (
          <div className="plans-state">
            <RefreshCw className="spinning-icon" size={20} />
          </div>
        ) : (
          <>
            {!usage.workspace.souDono && (
              <p className="plans-owner-note">
                <Info size={14} /> Os limites deste workspace seguem o plano de {usage.workspace.nomeDono}. Assinar um
                plano altera os workspaces dos quais você é dono.
              </p>
            )}
            <ul className="usage-meters">
              <UsageMeter
                label="Ideias ativas"
                used={usage.uso.ideias}
                limit={usage.limites.ideias}
                focused={reason === "ideias"}
              />
              <UsageMeter
                label="Conteúdos em produção"
                used={usage.uso.conteudosAtivos}
                limit={usage.limites.conteudosAtivos}
                focused={reason === "conteudosAtivos"}
              />
              <UsageMeter
                label="Armazenamento"
                used={usage.uso.armazenamentoBytes}
                limit={usage.limites.armazenamentoMB === null ? null : usage.limites.armazenamentoMB * MB}
                format={formatBytes}
                focused={reason === "armazenamentoMB"}
              />
              <UsageMeter
                label="Membros"
                used={usage.uso.membros}
                limit={usage.limites.membros}
                // Plano sem equipe: "1 de 1" não é um limite estourado, é o normal
                note={usage.limites.membros === 1 ? "uso individual" : undefined}
                focused={reason === "membros"}
              />
            </ul>
            <p className="plans-history-note">
              Histórico de métricas:{" "}
              <strong>
                {usage.limites.historicoMetricasDias === null
                  ? "completo"
                  : `últimos ${usage.limites.historicoMetricasDias} dias`}
              </strong>
            </p>
          </>
        )}
      </section>

      {catalogError ? (
        <div className="catalog-empty">
          <h3>Não foi possível carregar os planos</h3>
          <p>{catalogError}</p>
          <button className="btn btn-sm ideas-empty-action" onClick={loadCatalog}>
            <RefreshCw size={14} /> Tentar novamente
          </button>
        </div>
      ) : !catalog ? (
        <div className="catalog-loading">
          <RefreshCw className="spinning-icon" size={28} />
          <span>Carregando planos...</span>
        </div>
      ) : (
        <div className="plan-grid plan-grid-full">
          {catalog.planos.map((offer) => (
            <PlanCard
              key={offer.plano}
              offer={offer}
              currentPlan={currentPlan}
              testMode={catalog.modoTeste}
              pending={pending}
              highlighted={offer.plano === "CREATOR"}
              onSubscribe={subscribe}
              onActivateMock={activateMock}
            />
          ))}
        </div>
      )}

      <footer className="plans-footer">
        {/* Com Stripe, trocar de plano, cartão e cancelar ficam no portal do cliente (mudanças chegam por webhook) */}
        {catalog?.stripeConfigurado && (currentPlan !== "FREE" || user?.statusAssinatura) && (
          <button className="btn btn-secondary btn-sm plans-manage" onClick={manage} disabled={!!pending}>
            <Settings size={15} />
            {pending?.kind === "portal" ? "Abrindo o portal..." : "Gerenciar assinatura"}
          </button>
        )}
        {catalog && !catalog.stripeConfigurado && currentPlan !== "FREE" && (
          <button className="plans-cancel" onClick={cancel} disabled={!!pending}>
            {pending?.kind === "cancel" ? "Cancelando..." : "Cancelar assinatura e voltar ao Gratuito"}
          </button>
        )}
        <div className="stripe-secure-footer">
          <ShieldCheck size={16} />
          <span>
            Pagamento seguro pela Stripe. Cancele quando quiser.
            {catalog && !catalog.stripeConfigurado && " (Stripe não configurado: checkout simulado.)"}
          </span>
        </div>
      </footer>
    </div>
  );
};
