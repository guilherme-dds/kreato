import React, { useState, useCallback } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, type Location } from "react-router-dom";
import { RefreshCw, Crown } from "lucide-react";
import { AuthProvider, useAuth } from "./context/AuthContext";

import { AppLayout } from "./layouts/AppLayout";
import { useLayoutContext, type ShowToast } from "./layouts/layoutContext";
import { AuthPage } from "./components/AuthPage";
import { ResetPasswordPage } from "./components/ResetPasswordPage";
import { Toast, type ToastMessage } from "./components/Toast";
import { ProfilePage } from "./components/ProfilePage";
import { DashboardPage } from "./pages/DashboardPage";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { MAIN_NAV } from "./navigation";

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

/** Tela de login: quem já está autenticado volta para onde estava indo */
const PublicOnly: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: Location } | null)?.from;

  if (isLoading) return <FullScreenLoader />;
  if (isAuthenticated) return <Navigate to={from ? `${from.pathname}${from.search}` : "/"} replace />;
  return children;
};

const PlansPlaceholder: React.FC = () => {
  const { openPlansModal } = useLayoutContext();
  return (
    <ComingSoonPage
      icon={Crown}
      title="Planos"
      description="Compare os planos Gratuito, Kreato Creator e Kreato Studio."
    >
      <button className="btn btn-primary" onClick={openPlansModal}>
        Ver plano Kreato Creator
      </button>
    </ComingSoonPage>
  );
};

const AppRoutes: React.FC<{ showToast: ShowToast }> = ({ showToast }) => {
  const navigate = useNavigate();
  const modulePages = MAIN_NAV.filter((item) => item.path !== "/");

  return (
    <Routes>
      <Route
        path="/reset-password"
        element={<ResetPasswordPage showToast={showToast} onGoToLogin={() => navigate("/login")} />}
      />
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
        {modulePages.map((item) => (
          <Route
            key={item.path}
            path={item.path.slice(1)}
            element={<ComingSoonPage icon={item.icon} title={item.label} description={item.description} />}
          />
        ))}
        <Route path="planos" element={<PlansPlaceholder />} />
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
