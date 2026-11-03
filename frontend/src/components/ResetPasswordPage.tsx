import React, { useState } from "react";
import { Lock, Eye, EyeOff, CheckCircle, ArrowLeft } from "lucide-react";
import { KreatoLogo } from "./KreatoLogo";
import { confirmPasswordResetApi } from "../api/backend";

interface ResetPasswordPageProps {
  token?: string;
  showToast: (type: "success" | "error", text: string) => void;
  onGoToLogin: () => void;
}

export const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({
  token: propToken,
  showToast,
  onGoToLogin,
}) => {
  const urlToken = new URLSearchParams(window.location.search).get("token") || "";
  const token = propToken || urlToken;

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Token de redefinição não encontrado na URL.");
      return;
    }

    if (newPassword.length < 6) {
      setError("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("As senhas informadas não coincidem.");
      return;
    }

    setIsLoading(true);

    try {
      await confirmPasswordResetApi(token, newPassword);
      setSuccess(true);
      showToast("success", "Sua senha foi redefinida com sucesso!");
    } catch (err: any) {
      const msg = err.message || "Falha ao redefinir a senha. O token pode estar expirado.";
      setError(msg);
      showToast("error", msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page-container">
      <div className="auth-page-backdrop" />
      <div className="auth-page-content centered">
        <div className="auth-form-side">
          <div className="modal-card auth-page-card">
            <div className="auth-header">
              <div className="auth-logo-badge">
                <KreatoLogo size={56} />
              </div>
              <h2>Redefinição de Senha</h2>
              <p className="auth-subtitle">
                {success
                  ? "Sua senha foi atualizada!"
                  : "Crie uma nova senha segura para sua conta"}
              </p>
            </div>

            {success ? (
              <div style={{ textAlign: "center", padding: "1rem 0" }}>
                <div className="empty-icon-wrapper" style={{ color: "#22c55e", background: "rgba(34, 197, 94, 0.12)" }}>
                  <CheckCircle size={36} />
                </div>
                <h3 style={{ fontSize: "1.25rem", margin: "1rem 0 0.5rem 0" }}>Senha Alterada!</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "1.8rem" }}>
                  Sua senha foi redefinida com sucesso. Você já pode fazer login com suas novas credenciais.
                </p>
                <button
                  type="button"
                  className="submit-btn"
                  onClick={onGoToLogin}
                >
                  <ArrowLeft size={18} style={{ marginRight: "0.5rem" }} />
                  Ir para Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="auth-form">
                {error && <div className="auth-error-alert">{error}</div>}

                {!token && (
                  <div className="auth-error-alert">
                    Link de redefinição inválido ou token ausente na URL.
                  </div>
                )}

                <div className="input-group">
                  <label>Nova Senha</label>
                  <div className="input-wrapper">
                    <Lock className="input-icon" size={18} />
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="input-group">
                  <label>Confirmar Nova Senha</label>
                  <div className="input-wrapper">
                    <Lock className="input-icon" size={18} />
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="submit-btn"
                  disabled={isLoading || !token}
                >
                  {isLoading ? (
                    <span className="btn-spinner"></span>
                  ) : (
                    "Redefinir Senha"
                  )}
                </button>

                <button
                  type="button"
                  onClick={onGoToLogin}
                  style={{
                    background: "none",
                    color: "var(--text-muted)",
                    fontSize: "0.85rem",
                    textAlign: "center",
                    marginTop: "0.5rem",
                  }}
                >
                  Cancelar e voltar
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
