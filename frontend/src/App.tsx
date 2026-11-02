import React, { useState, useEffect, useCallback } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { getUserProfileApi, verifyStripeSessionApi } from "./api/backend";

import { Navbar } from "./components/Navbar";
import { PremiumModal } from "./components/PremiumModal";
import { AuthPage } from "./components/AuthPage";
import { ResetPasswordPage } from "./components/ResetPasswordPage";
import { Toast, type ToastMessage } from "./components/Toast";
import { ProfilePage } from "./components/ProfilePage";

import { Sparkles, Lightbulb, KanbanSquare, BarChart3, RefreshCw } from "lucide-react";

interface MainAppProps {
  showToast: (type: "success" | "error" | "info", text: string) => void;
}

const MainApp: React.FC<MainAppProps> = ({ showToast }) => {
  const { user, token, updateUser } = useAuth();

  const [currentView, setCurrentView] = useState<"home" | "profile">("home");
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);

  // Check URL parameters for Stripe Checkout status
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const stripeStatus = query.get("stripe_status");

    if (stripeStatus === "success" || stripeStatus === "success_mock") {
      const sessionId = query.get("session_id");
      if (token) {
        verifyStripeSessionApi(token, sessionId)
          .then((data) => {
            if (data.user) {
              updateUser({ isPremium: data.user.isPremium, ...data.user });
              showToast("success", "🎉 Parabéns! Sua assinatura do Plano Premium foi ativada com sucesso!");
            }
          })
          .catch((err) => {
            console.error("Erro ao verificar sessão do Stripe:", err);
            getUserProfileApi(token).then((u) => {
              updateUser({ isPremium: u.isPremium, ...u });
            }).catch(() => {});
          });
      } else {
        showToast("success", "🎉 Parabéns! Sua assinatura do Plano Premium foi ativada!");
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (stripeStatus === "cancel") {
      showToast("info", "Fluxo de pagamento com o Stripe cancelado. Você continua no Plano Gratuito.");
      if (token) {
        getUserProfileApi(token).then((u) => {
          updateUser({ isPremium: u.isPremium, ...u });
        }).catch(() => {});
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (stripeStatus === "manage_mock") {
      showToast("info", "Você já possui uma assinatura do Plano Premium ativa.");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [token, updateUser, showToast]);

  const userName = user?.nome || (user?.email ? user.email.split("@")[0] : "Criador");

  return (
    <div className="app-container">
      <Navbar
        openPremiumModal={() => setIsPremiumModalOpen(true)}
        onProfileClick={() => setCurrentView("profile")}
        onBrandClick={() => setCurrentView("home")}
        currentView={currentView}
      />

      <main className="main-content">
        {currentView === "profile" ? (
          <ProfilePage
            onBackToHome={() => setCurrentView("home")}
            showToast={showToast}
            openPremiumModal={() => setIsPremiumModalOpen(true)}
          />
        ) : (
          <>
            {/* Temporary home screen until the content modules are implemented */}
            <div className="section-header-row">
              <h2 className="section-title">
                <Sparkles size={24} style={{ color: "#f5c518" }} />
                <span>Olá, {userName}! Bem-vindo ao Kreato</span>
              </h2>
            </div>

            <div className="premium-features-grid">
              <div className="premium-feature-card">
                <div className="feature-icon gold">
                  <Lightbulb size={22} />
                </div>
                <div>
                  <h4>Central de Ideias e Roteiros</h4>
                  <p>Registre temas, ganchos e legendas em um só lugar. Em breve.</p>
                </div>
              </div>

              <div className="premium-feature-card">
                <div className="feature-icon red">
                  <KanbanSquare size={22} />
                </div>
                <div>
                  <h4>Pipeline e Calendário Editorial</h4>
                  <p>Acompanhe cada conteúdo da ideia à publicação. Em breve.</p>
                </div>
              </div>

              <div className="premium-feature-card">
                <div className="feature-icon blue">
                  <BarChart3 size={22} />
                </div>
                <div>
                  <h4>Acompanhamento de Resultados</h4>
                  <p>Registre métricas e compare o desempenho dos conteúdos. Em breve.</p>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>
          <Sparkles size={16} /> Kreato • Desenvolvido por Guilherme Dias
        </p>
      </footer>

      {/* Premium Subscription Modal */}
      <PremiumModal
        isOpen={isPremiumModalOpen}
        onClose={() => setIsPremiumModalOpen(false)}
        showToast={showToast}
      />
    </div>
  );
};

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((type: "success" | "error" | "info", text: string) => {
    setToast({ id: Date.now().toString(), type, text });
  }, []);

  const isResetRoute =
    window.location.pathname.includes("reset-password") ||
    window.location.search.includes("token=");

  if (isResetRoute) {
    return (
      <>
        <ResetPasswordPage
          showToast={showToast}
          onGoToLogin={() => {
            window.location.href = "/";
          }}
        />
        <Toast toast={toast} onClose={() => setToast(null)} />
      </>
    );
  }

  if (isLoading) {
    return (
      <div className="catalog-loading" style={{ minHeight: "100vh" }}>
        <RefreshCw className="spinning-icon" size={36} />
        <span>Verificando autenticação...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <AuthPage showToast={showToast} />
        <Toast toast={toast} onClose={() => setToast(null)} />
      </>
    );
  }

  return (
    <>
      <MainApp showToast={showToast} />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
};

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
