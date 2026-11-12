import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, LogIn, LogOut, RefreshCw, UserPlus, Users } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { AuthLayout } from "../components/AuthLayout";
import { acceptInviteApi, getInvitePreviewApi, setSelectedWorkspaceId } from "../api/backend";
import type { ShowToast } from "../layouts/layoutContext";
import type { InvitePreview } from "../types";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "../utils/team";

interface InvitePageProps {
  showToast: ShowToast;
}

const CLOSED_MESSAGES = {
  ACEITO: { title: "Convite já utilizado", text: "Este convite já foi aceito. Se foi você, é só entrar no Kreato." },
  REVOGADO: { title: "Convite cancelado", text: "Quem convidou cancelou este convite. Peça um novo se ainda precisar." },
  EXPIRADO: { title: "Convite expirado", text: "Convites valem por 7 dias. Peça para quem convidou reenviar." },
} as const;

/** Tela pública do link /convite?token=...: mostra o convite e deixa a pessoa entrar (ou criar conta) e aceitar */
export const InvitePage: React.FC<InvitePageProps> = ({ showToast }) => {
  const [params] = useSearchParams();
  const inviteToken = params.get("token") ?? "";
  const location = useLocation();
  const navigate = useNavigate();
  const { user, token, isAuthenticated, isLoading: isAuthLoading, logout } = useAuth();

  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    if (!inviteToken) {
      setError("O link do convite está incompleto.");
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    getInvitePreviewApi(inviteToken)
      .then((data) => !cancelled && setInvite(data))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Convite não encontrado"))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  const goToLogin = (cadastro: boolean) =>
    navigate("/login", { state: { from: location, email: invite?.email, cadastro } });

  const accept = async () => {
    if (!invite || isAccepting) return;
    setIsAccepting(true);
    try {
      const result = await acceptInviteApi(inviteToken, token);
      // Já abre o Kreato no workspace da equipe
      setSelectedWorkspaceId(result.workspace.id);
      showToast("success", `Bem-vindo(a) a ${result.workspace.nome}!`);
      navigate("/", { replace: true });
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao aceitar convite");
      setIsAccepting(false);
    }
  };

  const emailMatches = !!user && !!invite && user.email.trim().toLowerCase() === invite.email.toLowerCase();

  let body: React.ReactNode;
  if (isLoading || isAuthLoading) {
    body = (
      <div className="invite-status">
        <RefreshCw className="spinning-icon" size={26} />
        <p>Carregando convite...</p>
      </div>
    );
  } else if (error || !invite) {
    body = (
      <div className="invite-status">
        <AlertTriangle size={28} className="invite-icon-warning" />
        <h2>Convite não encontrado</h2>
        <p>{error ?? "Confira se o link foi copiado por inteiro."}</p>
        <Link to="/" className="btn btn-primary btn-sm">
          Ir para o Kreato
        </Link>
      </div>
    );
  } else if (invite.estado !== "PENDENTE") {
    const message = CLOSED_MESSAGES[invite.estado];
    body = (
      <div className="invite-status">
        <AlertTriangle size={28} className="invite-icon-warning" />
        <h2>{message.title}</h2>
        <p>{message.text}</p>
        <Link to="/" className="btn btn-primary btn-sm">
          Ir para o Kreato
        </Link>
      </div>
    );
  } else {
    body = (
      <>
        <div className="invite-summary">
          <span className="invite-workspace-icon">
            <Users size={22} />
          </span>
          <h2>{invite.workspace}</h2>
          <p>
            {invite.convidadoPor ? <strong>{invite.convidadoPor}</strong> : "Alguém"} convidou você para a equipe como{" "}
            <strong>{ROLE_LABELS[invite.papel].toLowerCase()}</strong>.
          </p>
          <p className="invite-role-desc">{ROLE_DESCRIPTIONS[invite.papel]}</p>
        </div>

        {!isAuthenticated ? (
          <div className="invite-actions">
            <p className="invite-note">
              Entre ou crie sua conta com <strong>{invite.email}</strong> para aceitar.
            </p>
            <button className="submit-btn" onClick={() => goToLogin(true)}>
              <UserPlus size={18} /> Criar conta
            </button>
            <button className="invite-secondary" onClick={() => goToLogin(false)}>
              <LogIn size={16} /> Já tenho conta
            </button>
          </div>
        ) : !emailMatches ? (
          <div className="invite-actions">
            <div className="auth-error-alert">
              Você está conectado como <strong>{user?.email}</strong>, mas o convite é para <strong>{invite.email}</strong>.
            </div>
            <button className="invite-secondary" onClick={logout}>
              <LogOut size={16} /> Sair e entrar com outra conta
            </button>
          </div>
        ) : (
          <div className="invite-actions">
            <button className="submit-btn" onClick={accept} disabled={isAccepting}>
              <CheckCircle2 size={18} /> {isAccepting ? "Entrando na equipe..." : "Aceitar convite"}
            </button>
            <Link to="/" className="invite-secondary">
              Agora não
            </Link>
          </div>
        )}
      </>
    );
  }

  return (
    <AuthLayout scene="Convite">
      <div className="invite-card">{body}</div>
    </AuthLayout>
  );
};
