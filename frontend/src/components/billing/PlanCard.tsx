import React from "react";
import { Check, CreditCard, Crown, Settings, Zap } from "lucide-react";
import type { PaidPlan, Plan, PlanOffer } from "../../types";
import { PLAN_LABELS, PLANS, planFeatures } from "../../utils/plans";
import { formatCurrencyCents } from "../../utils/format";
import type { PendingAction } from "./usePlanActions";

interface PlanCardProps {
  offer: PlanOffer;
  currentPlan: Plan;
  testMode: boolean;
  pending: PendingAction;
  highlighted?: boolean;
  onSubscribe: (plan: PaidPlan) => void;
  onActivateMock: (plan: Plan) => void;
}

export const PlanCard: React.FC<PlanCardProps> = ({
  offer,
  currentPlan,
  testMode,
  pending,
  highlighted,
  onSubscribe,
  onActivateMock,
}) => {
  const plan = offer.plano;
  const isCurrent = plan === currentPlan;
  const isFree = plan === "FREE";
  const isUpgrade = PLANS.indexOf(plan) > PLANS.indexOf(currentPlan);
  const busy = pending !== null;
  const isLoading = (kind: "checkout" | "mock") => pending?.kind === kind && pending.plan === plan;

  let primaryLabel: string;
  if (isCurrent) primaryLabel = "Gerenciar assinatura";
  else if (currentPlan === "FREE") primaryLabel = `Assinar ${offer.nome.replace("Kreato ", "")}`;
  else primaryLabel = `Mudar para ${offer.nome.replace("Kreato ", "")}`;

  return (
    <article className={`plan-card ${highlighted ? "is-highlighted" : ""} ${isCurrent ? "is-current" : ""}`}>
      <header className="plan-card-header">
        <div className="plan-card-title">
          <h3>{offer.nome}</h3>
          {isCurrent ? (
            <span className="plan-card-tag current">Seu plano</span>
          ) : (
            highlighted && <span className="plan-card-tag">Mais escolhido</span>
          )}
        </div>
        <p>{offer.descricao}</p>
      </header>

      <div className="plan-card-price">
        <strong>{isFree ? "Grátis" : formatCurrencyCents(offer.precoCentavos)}</strong>
        {!isFree && <span>/ mês</span>}
      </div>

      <ul className="plan-card-features">
        {planFeatures(offer.limites).map((feature) => (
          <li key={feature}>
            <Check size={14} /> {feature}
          </li>
        ))}
      </ul>

      {!isFree && (
        <div className="plan-card-actions">
          <button
            className={`btn btn-sm ${isCurrent ? "btn-secondary" : "btn-primary"}`}
            onClick={() => onSubscribe(plan as PaidPlan)}
            disabled={busy}
          >
            {isCurrent ? <Settings size={15} /> : isUpgrade ? <Crown size={15} /> : <CreditCard size={15} />}
            {isLoading("checkout") ? "Conectando ao Stripe..." : primaryLabel}
          </button>
          {testMode && !isCurrent && (
            <button
              className="plan-card-mock"
              onClick={() => onActivateMock(plan)}
              disabled={busy}
              title={`Ativa o ${PLAN_LABELS[plan]} sem pagamento (somente em ambiente de teste)`}
            >
              <Zap size={13} /> {isLoading("mock") ? "Ativando..." : "Testar sem cartão"}
            </button>
          )}
        </div>
      )}
    </article>
  );
};
