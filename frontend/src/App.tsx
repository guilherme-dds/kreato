import React, { Suspense, lazy, useState, useCallback } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, type Location } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { AuthProvider, useAuth } from "./context/AuthContext";

import { AppLayout } from "./layouts/AppLayout";
import type { ShowToast } from "./layouts/layoutContext";
import { AuthPage } from "./components/AuthPage";
import { ResetPasswordPage } from "./components/ResetPasswordPage";
import { Toast, type ToastMessage } from "./components/Toast";
import { ProfilePage } from "./components/ProfilePage";
import { DashboardPage } from "./pages/DashboardPage";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { IdeasPage } from "./pages/IdeasPage";
import { PipelinePage } from "./pages/PipelinePage";
import { CalendarPage } from "./pages/CalendarPage";
import { PlansPage } from "./pages/PlansPage";
import { TeamPage } from "./pages/TeamPage";
import { InvitePage } from "./pages/InvitePage";
import { MAIN_NAV } from "./navigation";

// Páginas com gráficos (recharts) carregam sob demanda para não pesar o bundle inicial
const ContentEditorPage = lazy(() =>
  import("./pages/ContentEditorPage").then((module) => ({ default: module.ContentEditorPage }))
);
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage").then((module) => ({ default: module.AnalyticsPage })));
const AdminPage = lazy(() => import("./pages/AdminPage").then((module) => ({ default: module.AdminPage })));

const PageLoader: React.FC = () => (
  <div className="catalog-loading">
    <RefreshCw className="spinning-icon" size={28} />
    <span>Carregando...</span>
  </div>
);

const withSuspense = (element: React.ReactElement) => <Suspense fallback={<PageLoader />}>{element}</Suspense>;

const FullScreenLoader: React.FC = () => (
  <div className="catalog-loading" style={{ minHeight: "100vh" }}>
    <RefreshCw className="spinning-icon" size={36} />
    <span>Verificando autenticação...</span>
  </div>
);

/** Rotas internas: exige login e preserva o destino (incluindo ?stripe_status) para depois do login */
const RequireAuth: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullScreenLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
};

/** Painel administrativo: só para contas com role admin (o backend também recusa as demais) */
const RequireAdmin: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user } = useAuth();
  if (user?.role?.toLowerCase() !== "admin") return <Navigate to="/" replace />;
  return children;
};

/** Tela de login: quem já está autenticado volta para onde estava indo */
const PublicOnly: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: Location } | null)?.from;

  if (isLoading) return <FullScreenLoader />;
  if (isAuthenticated) return <Navigate to={from ? `${from.pathname}${from.search}` : "/"} replace />;
  return children;
};

const AppRoutes: React.FC<{ showToast: ShowToast }> = ({ showToast }) => {
  const navigate = useNavigate();
  // Módulos já implementados têm rota própria; os demais exibem "em breve"
  const implementedPaths = ["/", "/ideias", "/pipeline", "/calendario", "/metricas", "/equipe"];
  const modulePages = MAIN_NAV.filter((item) => !implementedPaths.includes(item.path));

  return (
    <Routes>
      <Route
        path="/reset-password"
        element={<ResetPasswordPage showToast={showToast} onGoToLogin={() => navigate("/login")} />}
      />
      {/* Link do e-mail de convite: abre logado ou não */}
      <Route path="/convite" element={<InvitePage showToast={showToast} />} />
      <Route
        path="/login"
        element={
          <PublicOnly>
            <AuthPage showToast={showToast} />
          </PublicOnly>
        }
      />

      <Route
        element={
          <RequireAuth>
            <AppLayout showToast={showToast} />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="ideias" element={<IdeasPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="pipeline/:id" element={withSuspense(<ContentEditorPage />)} />
        <Route path="calendario" element={<CalendarPage />} />
        <Route path="metricas" element={withSuspense(<AnalyticsPage />)} />
        <Route path="equipe" element={<TeamPage />} />
        <Route path="admin" element={<RequireAdmin>{withSuspense(<AdminPage />)}</RequireAdmin>} />
        {modulePages.map((item) => (
          <Route
            key={item.path}
            path={item.path.slice(1)}
            element={<ComingSoonPage icon={item.icon} title={item.label} description={item.description} />}
          />
        ))}
        <Route path="planos" element={<PlansPage />} />
        <Route path="perfil" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const AppContent: React.FC = () => {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback<ShowToast>((type, text) => {
    setToast({ id: Date.now().toString(), type, text });
  }, []);

  return (
    <>
      <AppRoutes showToast={showToast} />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
};

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
