import React, { useEffect } from "react";
import { Crown, RefreshCw, ShieldCheck, X } from "lucide-react";
import { PlanCard } from "./billing/PlanCard";
import { usePlanActions } from "./billing/usePlanActions";
import { PLAN_LABELS } from "../utils/plans";

interface PremiumModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (type: "success" | "error" | "info", text: string) => void;
}

const PremiumModalContent: React.FC<Omit<PremiumModalProps, "isOpen">> = ({ onClose, showToast }) => {
  const { catalog, catalogError, loadCatalog, currentPlan, pending, subscribe, activateMock, cancel } = usePlanActions(
    showToast,
    onClose
  );
  const paidOffers = catalog?.planos.filter((offer) => offer.plano !== "FREE") ?? [];
  const isPaid = currentPlan !== "FREE";

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, pending]);

  return (
    <div className="modal-backdrop" onClick={() => !pending && onClose()}>
      <div
        className="premium-modal-content plans-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plans-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close-btn" onClick={onClose} aria-label="Fechar" disabled={!!pending}>
          <X size={20} />
        </button>

        <div className="premium-modal-header">
          <div className="premium-icon-wrapper">
            <Crown size={34} className="crown-glow" />
          </div>
          <h2 id="plans-modal-title">
            {isPaid ? (
              <>
                Você está no <span className="gold-text">{PLAN_LABELS[currentPlan]}</span>
              </>
            ) : (
              <>
                Escolha seu plano <span className="gold-text">Kreato</span>
              </>
            )}
          </h2>
          <p>Produza sem limites sozinho com o Creator, ou traga sua equipe com o Studio.</p>
        </div>

        {catalogError ? (
          <div className="plans-modal-state">
            <p>{catalogError}</p>
            <button className="btn btn-sm btn-secondary" onClick={loadCatalog}>
              <RefreshCw size={14} /> Tentar novamente
            </button>
          </div>
        ) : !catalog ? (
          <div className="plans-modal-state">
            <RefreshCw className="spinning-icon" size={22} />
            <span>Carregando planos...</span>
          </div>
        ) : (
          <div className="plan-grid">
            {paidOffers.map((offer) => (
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

        {isPaid && (
          <button className="plans-modal-cancel" onClick={cancel} disabled={!!pending}>
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
      </div>
    </div>
  );
};

/** Modal de planos: só monta o conteúdo (e busca o catálogo) quando aberto */
export const PremiumModal: React.FC<PremiumModalProps> = ({ isOpen, ...props }) =>
  isOpen ? <PremiumModalContent {...props} /> : null;
