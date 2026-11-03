import React, { useState } from "react";
import { X, Crown, Sparkles, Zap, ShieldCheck, Lightbulb, CalendarDays, BarChart3, CreditCard } from "lucide-react";
import { createStripeCheckoutSessionApi, toggleMockPremiumApi, cancelStripeSubscriptionApi } from "../api/backend";
import { useAuth } from "../context/AuthContext";
import { isPaidPlan } from "../utils/plans";

interface PremiumModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (type: "success" | "error" | "info", text: string) => void;
}

export const PremiumModal: React.FC<PremiumModalProps> = ({ isOpen, onClose, showToast }) => {
  const { user, updateUser } = useAuth();
  const [loadingStripe, setLoadingStripe] = useState(false);
  const [loadingMock, setLoadingMock] = useState(false);
  const [loadingCancel, setLoadingCancel] = useState(false);

  if (!isOpen) return null;

  const handleStripeCheckout = async () => {
    setLoadingStripe(true);
    try {
      const data = await createStripeCheckoutSessionApi();
      if (data.url) {
        showToast("info", "Redirecionando para o Stripe...");
        window.location.href = data.url;
      } else if (data.mockActivated) {
        updateUser({ plano: "CREATOR" });
        showToast("success", "Plano Kreato Creator ativado com sucesso em modo de teste!");
        onClose();
      }
    } catch (err: any) {
      showToast("error", err.message || "Erro ao conectar com o Stripe Checkout.");
    } finally {
      setLoadingStripe(false);
    }
  };

  const handleMockToggle = async () => {
    setLoadingMock(true);
    try {
      const data = await toggleMockPremiumApi();
      updateUser({ plano: data.user.plano });
      showToast(
        "success",
        isPaidPlan(data.user)
          ? "🎉 Você agora é assinante do Kreato Creator em modo de teste!"
          : "Plano pago desativado. Você voltou para o Plano Gratuito."
      );
      onClose();
    } catch (err: any) {
      showToast("error", err.message || "Erro ao atualizar o plano.");
    } finally {
      setLoadingMock(false);
    }
  };

  const handleCancelSubscription = async () => {
    setLoadingCancel(true);
    try {
      const data = await cancelStripeSubscriptionApi();
      updateUser({ plano: "FREE", ...data.user });
      showToast("info", "Assinatura cancelada. Você voltou ao Plano Gratuito.");
      onClose();
    } catch (err: any) {
      showToast("error", err.message || "Erro ao cancelar assinatura.");
    } finally {
      setLoadingCancel(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="premium-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose} aria-label="Fechar">
          <X size={20} />
        </button>

        <div className="premium-modal-header">
          <div className="premium-icon-wrapper">
            <Crown size={38} className="crown-glow" />
          </div>
          <h2>Kreato <span className="gold-text">CREATOR</span></h2>
          <p>Desbloqueie todo o potencial da plataforma sem nenhuma limitação!</p>
        </div>

        <div className="premium-features-grid">
          <div className="premium-feature-card">
            <div className="feature-icon gold">
              <Sparkles size={22} />
            </div>
            <div>
              <h4>Selo Exclusivo de Assinante</h4>
              <p>Destaque-se com o selo dourado do seu plano no perfil.</p>
            </div>
          </div>

          <div className="premium-feature-card">
            <div className="feature-icon primary">
              <Lightbulb size={22} />
            </div>
            <div>
              <h4>Ideias e Conteúdos Ilimitados</h4>
              <p>Registre quantas ideias, roteiros e conteúdos quiser, sem limites de uso.</p>
            </div>
          </div>

          <div className="premium-feature-card">
            <div className="feature-icon blue">
              <CalendarDays size={22} />
            </div>
            <div>
              <h4>Calendário Editorial Completo</h4>
              <p>Planeje suas publicações e mantenha uma frequência consistente.</p>
            </div>
          </div>

          <div className="premium-feature-card">
            <div className="feature-icon purple">
              <BarChart3 size={22} />
            </div>
            <div>
              <h4>Histórico Completo de Métricas</h4>
              <p>Compare o desempenho dos seus conteúdos e oriente suas próximas produções.</p>
            </div>
          </div>
        </div>

        <div className="premium-pricing-card">
          <div className="price-tag">
            <span className="currency">R$</span>
            <span className="amount">19,90</span>
            <span className="period">/ mês</span>
          </div>
          <p className="price-sub">Cancele quando quiser. Pagamento via Stripe (Modo de Teste ou Produção).</p>

          <div className="premium-actions">
            <button
              className="btn btn-premium-checkout"
              onClick={handleStripeCheckout}
              disabled={loadingStripe || loadingMock || loadingCancel}
            >
              <CreditCard size={18} />
              {loadingStripe
                ? "Conectando ao Stripe..."
                : isPaidPlan(user)
                ? "Gerenciar no Stripe"
                : "Assinar Agora via Stripe"}
            </button>

            {isPaidPlan(user) ? (
              <button
                className="btn btn-secondary-mock"
                onClick={handleCancelSubscription}
                disabled={loadingStripe || loadingMock || loadingCancel}
                style={{ borderColor: "rgba(239, 68, 68, 0.4)", color: "#ff6b6b" }}
              >
                <X size={16} />
                {loadingCancel ? "Cancelando..." : "Cancelar Assinatura (Voltar ao Gratuito)"}
              </button>
            ) : (
              <button
                className="btn btn-secondary-mock"
                onClick={handleMockToggle}
                disabled={loadingStripe || loadingMock || loadingCancel}
              >
                <Zap size={16} />
                {loadingMock ? "Processando..." : "Ativar Teste Rápido sem Cartão"}
              </button>
            )}
          </div>
        </div>

        <div className="stripe-secure-footer">
          <ShieldCheck size={16} />
          <span>Pagamento seguro processado e criptografado pela Stripe Payments</span>
        </div>
      </div>
    </div>
  );
};
