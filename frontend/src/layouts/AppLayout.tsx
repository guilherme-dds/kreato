import React, { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Crown, Lock, LogOut, Menu, Sparkles, User as UserIcon, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getUserProfileApi, verifyStripeSessionApi } from "../api/backend";
import { KreatoLogo } from "../components/KreatoLogo";
import { PremiumBadge } from "../components/PremiumBadge";
import { PremiumModal } from "../components/PremiumModal";
import { MAIN_NAV } from "../navigation";
import { PLAN_LABELS, getUserPlan, hasPlanAtLeast, isPaidPlan } from "../utils/plans";
import type { LayoutContext, ShowToast } from "./layoutContext";

interface AppLayoutProps {
  showToast: ShowToast;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ showToast }) => {
  const { user, token, updateUser, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isPlansModalOpen, setIsPlansModalOpen] = useState(false);
  const handledStripeSearch = useRef<string | null>(null);

  const plan = getUserPlan(user);
  const isPaid = isPaidPlan(user);
  const userName = user?.nome || (user?.email ? user.email.split("@")[0] : "Criador");

  const openPlansModal = useCallback(() => setIsPlansModalOpen(true), []);

  // Fecha o menu lateral (mobile) ao trocar de página
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  // Trata o retorno do Stripe Checkout (?stripe_status=...)
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const stripeStatus = query.get("stripe_status");
    if (!stripeStatus || handledStripeSearch.current === location.search) return;
    handledStripeSearch.current = location.search;

    const refreshProfile = () => {
      if (!token) return;
      getUserProfileApi(token).then(updateUser).catch(() => {});
    };

    if (stripeStatus === "success" || stripeStatus === "success_mock") {
      if (token) {
        verifyStripeSessionApi(token, query.get("session_id"), query.get("plano"))
          .then((data) => {
            if (data.user) {
              updateUser(data.user);
              showToast(
                "success",
                `🎉 Parabéns! Sua assinatura do plano ${PLAN_LABELS[getUserPlan(data.user)]} foi ativada com sucesso!`
              );
            }
          })
          .catch((err) => {
            console.error("Erro ao verificar sessão do Stripe:", err);
            showToast("error", err instanceof Error ? err.message : "Não foi possível confirmar o pagamento.");
            refreshProfile();
          });
      } else {
        showToast("success", "🎉 Parabéns! Sua assinatura foi ativada!");
      }
    } else if (stripeStatus === "cancel") {
      showToast("info", "Fluxo de pagamento com o Stripe cancelado. Você continua no Plano Gratuito.");
      refreshProfile();
    } else if (stripeStatus === "manage_mock") {
      showToast("info", "Você já possui uma assinatura ativa.");
    }

    navigate(location.pathname, { replace: true });
  }, [location.search, location.pathname, navigate, token, updateUser, showToast]);

  return (
    <div className={`app-shell ${isSidebarOpen ? "sidebar-open" : ""}`}>
      {/* Mobile Top Bar */}
      <header className="mobile-topbar">
        <button className="icon-button" onClick={() => setIsSidebarOpen(true)} aria-label="Abrir menu">
          <Menu size={22} />
        </button>
        <NavLink to="/" className="sidebar-brand compact">
          <KreatoLogo size={32} />
          <span className="brand-title">Kreato</span>
        </NavLink>
      </header>

      <div className="sidebar-backdrop" onClick={() => setIsSidebarOpen(false)} />

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <NavLink to="/" className="sidebar-brand">
            <KreatoLogo size={38} />
            <div className="brand-text">
              <span className="brand-title">Kreato</span>
              <span className="brand-subtitle">Central do Criador</span>
            </div>
          </NavLink>
          <button
            className="icon-button sidebar-close"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {MAIN_NAV.map((item) => {
            const Icon = item.icon;
            const isLocked = item.requiredPlan && !hasPlanAtLeast(user, item.requiredPlan);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
              >
                <Icon size={19} />
                <span>{item.label}</span>
                {isLocked && item.requiredPlan && (
                  <span className="sidebar-link-badge" title={`Disponível no ${PLAN_LABELS[item.requiredPlan]}`}>
                    <Lock size={10} /> {item.requiredPlan}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          {/* Plan Card */}
          <div className={`sidebar-plan-card ${isPaid ? "paid" : ""}`}>
            <div className="sidebar-plan-title">
              <Crown size={15} />
              <span>{isPaid ? PLAN_LABELS[plan] : "Plano Gratuito"}</span>
            </div>
            <p>{isPaid ? "Todos os recursos de organização liberados." : "Desbloqueie ideias e conteúdos ilimitados."}</p>
            <button className="sidebar-plan-btn" onClick={openPlansModal}>
              {isPaid ? (
                "Gerenciar plano"
              ) : (
                <>
                  <Sparkles size={14} /> Fazer upgrade
                </>
              )}
            </button>
          </div>

          {/* User */}
          <div className="sidebar-user">
            <NavLink
              to="/perfil"
              className={({ isActive }) => `sidebar-user-link ${isActive ? "active" : ""}`}
              title="Ver meu perfil"
            >
              <div className="avatar-circle">
                {user?.fotoPerfil ? (
                  <img src={user.fotoPerfil} alt="" className="navbar-avatar-img" />
                ) : (
                  <UserIcon size={16} />
                )}
              </div>
              <span className="sidebar-user-name">{userName}</span>
              {isPaid && <PremiumBadge plan={plan} size="sm" showIconOnly />}
            </NavLink>
            <button className="icon-button" onClick={logout} title="Sair da conta" aria-label="Sair da conta">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Page Content */}
      <main className="app-main">
        <div className="app-main-inner">
          <Outlet context={{ showToast, openPlansModal } satisfies LayoutContext} />
        </div>
      </main>

      <PremiumModal isOpen={isPlansModalOpen} onClose={() => setIsPlansModalOpen(false)} showToast={showToast} />
    </div>
  );
};
