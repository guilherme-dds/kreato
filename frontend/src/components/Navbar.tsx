import React from "react";
import { Film, Heart, Search, LogOut, User as UserIcon, Sparkles, ShieldAlert, Crown } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { PremiumBadge } from "./PremiumBadge";

interface NavbarProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  showOnlyFavorites: boolean;
  setShowOnlyFavorites: (val: boolean) => void;
  favoritesCount: number;
  openAuthModal: () => void;
  openAdminModal?: () => void;
  openPremiumModal?: () => void;
  onProfileClick?: () => void;
  onBrandClick?: () => void;
  currentView?: "catalog" | "profile";
}

export const Navbar: React.FC<NavbarProps> = ({
  searchTerm,
  setSearchTerm,
  showOnlyFavorites,
  setShowOnlyFavorites,
  favoritesCount,
  openAuthModal,
  openAdminModal,
  openPremiumModal,
  onProfileClick,
  onBrandClick,
  currentView = "catalog",
}) => {
  const { user, isAuthenticated, logout } = useAuth();
  const isAdmin = user?.role?.toLowerCase() === "admin";
  const isPremium = Boolean(user?.isPremium);

  const handleBrandClick = () => {
    setShowOnlyFavorites(false);
    if (onBrandClick) {
      onBrandClick();
    }
  };

  return (
    <header className="navbar-header">
      <div className="navbar-container">
        {/* Brand */}
        <div className="navbar-brand" onClick={handleBrandClick}>
          <div className="logo-icon-wrapper">
            <Film className="logo-icon" size={26} />
            <Sparkles className="logo-sparkle" size={14} />
          </div>
          <div className="brand-text">
            <span className="brand-title">Kreato</span>
            <span className="brand-subtitle">Central do Criador</span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="search-box">
          <Search className="search-icon" size={18} />
          <input
            type="text"
            placeholder="Buscar por título, personagem ou ano..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          {searchTerm && (
            <button className="search-clear" onClick={() => setSearchTerm("")}>
              ✕
            </button>
          )}
        </div>

        {/* Navigation Actions */}
        <div className="navbar-actions">
          {/* Favorites Filter Toggle */}
          <button
            className={`nav-btn ${showOnlyFavorites && currentView === "catalog" ? "active" : ""}`}
            onClick={() => {
              if (currentView === "profile" && onBrandClick) {
                onBrandClick();
              }
              setShowOnlyFavorites(!showOnlyFavorites);
            }}
            title="Filtrar Favoritos"
          >
            <Heart size={18} className={showOnlyFavorites && currentView === "catalog" ? "fill-heart" : ""} />
            <span className="btn-label">Favoritos</span>
            {favoritesCount > 0 && <span className="favorites-badge">{favoritesCount}</span>}
          </button>

          {/* Premium Plan Upgrade / Status Button */}
          {isAuthenticated && openPremiumModal && (
            <button
              className={`nav-btn ${isPremium ? "premium-active-btn" : "premium-nav-btn"}`}
              onClick={openPremiumModal}
              title={isPremium ? "Você é um Membro Premium!" : "Assinar o Plano Premium"}
            >
              <Crown size={18} className={isPremium ? "crown-active" : "crown-glow"} />
              <span className="btn-label">{isPremium ? "Premium" : "Seja Premium"}</span>
            </button>
          )}

          {/* Admin Moderation Button */}
          {isAuthenticated && isAdmin && openAdminModal && (
            <button
              className="nav-btn admin-nav-btn"
              onClick={openAdminModal}
              title="Painel de Moderação de Comentários (ADMIN)"
            >
              <ShieldAlert size={18} />
              <span className="btn-label">Moderação</span>
              <span className="admin-pill">ADMIN</span>
            </button>
          )}

          {/* User Auth Section */}
          {isAuthenticated ? (
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
                  {isPremium && <PremiumBadge size="sm" showIconOnly />}
                </div>
              </div>
              <button className="logout-btn" onClick={logout} title="Sair da Conta">
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <button className="login-trigger-btn" onClick={openAuthModal}>
              <UserIcon size={18} />
              <span>Entrar / Cadastrar</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
