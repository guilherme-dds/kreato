import React from "react";
import { Film, LogOut, User as UserIcon, Sparkles, Crown } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { PremiumBadge } from "./PremiumBadge";
import { PLAN_LABELS, getUserPlan, isPaidPlan } from "../utils/plans";

interface NavbarProps {
  openPremiumModal?: () => void;
  onProfileClick?: () => void;
  onBrandClick?: () => void;
  currentView?: "home" | "profile";
}

export const Navbar: React.FC<NavbarProps> = ({
  openPremiumModal,
  onProfileClick,
  onBrandClick,
  currentView = "home",
}) => {
  const { user, isAuthenticated, logout } = useAuth();
  const plan = getUserPlan(user);
  const isPaid = isPaidPlan(user);

  return (
    <header className="navbar-header">
      <div className="navbar-container">
        {/* Brand */}
        <div className="navbar-brand" onClick={onBrandClick}>
          <div className="logo-icon-wrapper">
            <Film className="logo-icon" size={26} />
            <Sparkles className="logo-sparkle" size={14} />
          </div>
          <div className="brand-text">
            <span className="brand-title">Kreato</span>
            <span className="brand-subtitle">Central do Criador</span>
          </div>
        </div>

        {/* Navigation Actions */}
        <div className="navbar-actions">
          {/* Premium Plan Upgrade / Status Button */}
          {isAuthenticated && openPremiumModal && (
            <button
              className={`nav-btn ${isPaid ? "premium-active-btn" : "premium-nav-btn"}`}
              onClick={openPremiumModal}
              title={isPaid ? `Você é assinante do plano ${PLAN_LABELS[plan]}` : "Conhecer os planos pagos"}
            >
              <Crown size={18} className={isPaid ? "crown-active" : "crown-glow"} />
              <span className="btn-label">{isPaid ? PLAN_LABELS[plan] : "Fazer upgrade"}</span>
            </button>
          )}

          {/* User Auth Section */}
          {isAuthenticated && (
            <div className={`user-menu ${currentView === "profile" ? "profile-active" : ""}`}>
              <div
                className="user-badge clickable"
                onClick={onProfileClick}
                title="Ver Meu Perfil"
              >
                <div className="avatar-circle">
                  {user?.fotoPerfil ? (
                    <img src={user.fotoPerfil} alt="" className="navbar-avatar-img" />
                  ) : (
                    <UserIcon size={16} />
                  )}
                </div>
                <div className="user-name-wrapper">
                  <span className="user-email">{user?.nome || user?.email.split("@")[0]}</span>
                  {isPaid && <PremiumBadge plan={plan} size="sm" showIconOnly />}
                </div>
              </div>
              <button className="logout-btn" onClick={logout} title="Sair da Conta">
                <LogOut size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
