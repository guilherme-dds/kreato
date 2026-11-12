import React, { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, Crown, Lock, LogOut, Menu, ShieldCheck, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  WORKSPACE_LOST_EVENT,
  getSelectedWorkspaceId,
  getUserProfileApi,
  getWorkspacesApi,
  setSelectedWorkspaceId,
  verifyStripeSessionApi,
  openBillingPortalApi,
  pollUntil,
} from "../api/backend";
import { KreatoLogo } from "../components/KreatoLogo";
import { UpNext } from "../components/UpNext";
import { WorkspaceSwitcher } from "../components/WorkspaceSwitcher";
import { MAIN_NAV, NAV_GROUP_LABELS, type NavGroup, type NavItem } from "../navigation";
import { PLAN_LABELS, PLANS, getUserPlan, isPaidPlan } from "../utils/plans";
import type { LayoutContext, ShowToast } from "./layoutContext";
import type { PlanResource, WorkspaceSummary } from "../types";

const NAV_GROUP_ORDER: NavGroup[] = ["inicio", "producao", "resultados", "estudio"];

const navGroups: { group: NavGroup; items: NavItem[] }[] = NAV_GROUP_ORDER.map((group) => ({
  group,
  items: MAIN_NAV.filter((item) => item.group === group),
}));

interface AppLayoutProps {
  showToast: ShowToast;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ showToast }) => {
  const { user, token, updateUser, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const handledStripeSearch = useRef<string | null>(null);
  // Plano de antes de abrir o portal: a volta espera o webhook mudar o plano
  const planRef = useRef(getUserPlan(user));
  planRef.current = getUserPlan(user);

  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  // null = workspace pessoal (requisições sem o header X-Workspace-Id)
  const [selectedId, setSelectedId] = useState<string | null>(() => getSelectedWorkspaceId());

  const activeWorkspace =
    workspaces.find((w) => (selectedId ? w.id === selectedId : w.pessoal)) ?? workspaces.find((w) => w.pessoal) ?? null;

  const plan = getUserPlan(user);
  const isPaid = isPaidPlan(user);
  const isAdmin = user?.role?.toLowerCase() === "admin";
  const userName = user?.nome || (user?.email ? user.email.split("@")[0] : "Criador");

  const openPlans = useCallback(
    (reason?: PlanResource) => navigate("/planos", reason ? { state: { motivo: reason } } : undefined),
    [navigate]
  );

  const refreshWorkspaces = useCallback(async () => {
    try {
      const list = await getWorkspacesApi(token);
      setWorkspaces(list);
      // A seleção salva não existe mais (saiu ou foi removido): volta para o pessoal
      const saved = getSelectedWorkspaceId();
      if (saved && !list.some((w) => w.id === saved)) {
        setSelectedWorkspaceId(null);
        setSelectedId(null);
      }
    } catch (err) {
      console.error("Erro ao carregar workspaces:", err);
    }
  }, [token]);

  useEffect(() => {
    refreshWorkspaces();
  }, [refreshWorkspaces]);

  const switchWorkspace = useCallback(
    (workspace: WorkspaceSummary) => {
      const id = workspace.pessoal ? null : workspace.id;
      setSelectedWorkspaceId(id);
      setSelectedId(id);
      // Um conteúdo aberto pertence ao workspace anterior
      if (/^\/pipeline\/.+/.test(location.pathname)) navigate("/pipeline");
      showToast("info", `Você está em ${workspace.nome}.`);
    },
    [location.pathname, navigate, showToast]
  );

  // O servidor recusou o workspace salvo (ex.: a pessoa foi removida da equipe)
  useEffect(() => {
    const handleLost = (event: Event) => {
      setSelectedId(null);
      const code = (event as CustomEvent<{ code?: string }>).detail?.code;
      showToast(
        "error",
        code === "WORKSPACE_SEAT_UNAVAILABLE"
          ? "O plano desse workspace não tem mais vaga para você. Voltamos para o seu workspace pessoal."
          : "Você não tem mais acesso a esse workspace. Voltamos para o seu workspace pessoal."
      );
      refreshWorkspaces();
    };
    window.addEventListener(WORKSPACE_LOST_EVENT, handleLost);
    return () => window.removeEventListener(WORKSPACE_LOST_EVENT, handleLost);
  }, [refreshWorkspaces, showToast]);

  // Recursos de plano no menu seguem o plano do dono do workspace atual
  const workspacePlan = activeWorkspace?.plano ?? plan;

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
        // O redirect não ativa nada: espera o webhook do Stripe gravar a assinatura no banco
        const sessionId = query.get("session_id");
        const plano = query.get("plano");
        if (stripeStatus === "success") showToast("info", "Pagamento recebido. Aguardando a confirmação do Stripe...");
        pollUntil(
          () => verifyStripeSessionApi(token, sessionId, plano),
          (data) => data.confirmado,
          { timeoutMs: 45_000 }
        ).then(({ value, ok }) => {
          if (value?.user) updateUser(value.user);
          if (ok && value) {
            showToast(
              "success",
              `🎉 Parabéns! Sua assinatura do plano ${PLAN_LABELS[getUserPlan(value.user)]} foi ativada com sucesso!`
            );
          } else {
            showToast("info", "O Stripe ainda não confirmou a assinatura. O plano será atualizado em instantes.");
            refreshProfile();
          }
        });
      } else {
        showToast("success", "🎉 Parabéns! Sua assinatura foi ativada!");
      }
    } else if (stripeStatus === "portal") {
      // Voltou do portal: mudanças (troca, cancelamento) chegam por webhook logo em seguida
      if (token) {
        const before = planRef.current;
        pollUntil(
          () => getUserProfileApi(token),
          (profile) => getUserPlan(profile) !== before,
          { timeoutMs: 12_000 }
        ).then(({ value, ok }) => {
          if (value) updateUser(value);
          if (ok && value) showToast("success", `Seu plano agora é ${PLAN_LABELS[getUserPlan(value)]}.`);
        });
      }
    } else if (stripeStatus === "cancel") {
      showToast("info", "Fluxo de pagamento com o Stripe cancelado. Você continua no Plano Gratuito.");
      refreshProfile();
    } else if (stripeStatus === "manage_mock") {
      showToast("info", "Você já possui uma assinatura ativa.");
    }

    navigate(location.pathname, { replace: true });
  }, [location.search, location.pathname, navigate, token, updateUser, showToast]);

  const paymentFailed = user?.statusAssinatura === "past_due" || user?.statusAssinatura === "unpaid";
  const openPortal = () => {
    openBillingPortalApi(token)
      .then(({ url }) => {
        window.location.href = url;
      })
      .catch((err) => showToast("error", err instanceof Error ? err.message : "Erro ao abrir o portal."));
  };

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
            <KreatoLogo size={30} />
            <span className="brand-title">Kreato</span>
          </NavLink>
          <button
            className="icon-button sidebar-close"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>

        <WorkspaceSwitcher workspaces={workspaces} active={activeWorkspace} onSelect={switchWorkspace} />

        <nav className="sidebar-nav" aria-label="Principal">
          {navGroups.map(({ group, items }) => (
            <div key={group} className="sidebar-group">
              {NAV_GROUP_LABELS[group] && <h2 className="sidebar-label">{NAV_GROUP_LABELS[group]}</h2>}
              {items.map((item) => {
                const Icon = item.icon;
                const isLocked = item.requiredPlan && PLANS.indexOf(workspacePlan) < PLANS.indexOf(item.requiredPlan);
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === "/"}
                    className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
                  >
                    <Icon size={17} aria-hidden="true" />
                    <span>{item.label}</span>
                    {isLocked && item.requiredPlan && (
                      <span className="sidebar-link-badge" title={`Disponível no ${PLAN_LABELS[item.requiredPlan]}`}>
                        <Lock size={10} aria-hidden="true" /> {PLAN_LABELS[item.requiredPlan].replace("Kreato ", "")}
                      </span>
                    )}
                  </NavLink>
                );
              })}
              {group === "estudio" && isAdmin && (
                <NavLink to="/admin" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}>
                  <ShieldCheck size={17} aria-hidden="true" />
                  <span>Admin</span>
                </NavLink>
              )}
            </div>
          ))}
        </nav>

        <UpNext token={token} refreshKey={selectedId ?? "pessoal"} />

        <div className="sidebar-footer">
          <NavLink to="/planos" className={`sidebar-plan ${isPaid ? "is-paid" : ""}`}>
            <Crown size={15} aria-hidden="true" className="sidebar-plan-icon" />
            <span className="sidebar-plan-name">{isPaid ? PLAN_LABELS[plan] : "Plano gratuito"}</span>
            <span className="sidebar-plan-action">{isPaid ? "Gerenciar" : "Fazer upgrade"}</span>
          </NavLink>

          <div className="sidebar-user">
            <NavLink
              to="/perfil"
              className={({ isActive }) => `sidebar-user-link ${isActive ? "active" : ""}`}
              title="Ver meu perfil"
            >
              <span className="avatar-circle">
                {user?.fotoPerfil ? (
                  <img src={user.fotoPerfil} alt="" className="navbar-avatar-img" />
                ) : (
                  userName.charAt(0).toUpperCase()
                )}
              </span>
              <span className="sidebar-user-name">{userName}</span>
            </NavLink>
            <button className="icon-button" onClick={logout} title="Sair da conta" aria-label="Sair da conta">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      {/* Page Content */}
      <main className="app-main">
        <div className="app-main-inner">
          {paymentFailed && (
            <div className="billing-alert" role="alert">
              <AlertTriangle size={18} />
              <p>
                <strong>A cobrança da sua assinatura foi recusada.</strong> Os recursos do plano pago ficam suspensos
                até o pagamento ser regularizado.
              </p>
              <button className="btn btn-primary btn-sm" onClick={openPortal}>
                Atualizar pagamento
              </button>
            </div>
          )}
          {/* A key remonta as páginas ao trocar de workspace, para recarregarem os dados certos */}
          <Outlet
            key={selectedId ?? "pessoal"}
            context={
              { showToast, openPlans, workspace: activeWorkspace, refreshWorkspaces, switchWorkspace } satisfies LayoutContext
            }
          />
        </div>
      </main>

    </div>
  );
};
