import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import { Mail, Lock, User as UserIcon, Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { KreatoLogo } from "./KreatoLogo";
import { requestPasswordResetApi } from "../api/backend";

interface AuthPageProps {
  showToast: (type: "success" | "error", text: string) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ showToast }) => {
  const { login, register } = useAuth();
  // Vindo de um convite: já abre no modo certo e com o e-mail convidado
  const hint = (useLocation().state as { email?: string; cadastro?: boolean } | null) ?? {};
  const [isRegister, setIsRegister] = useState(hint.cadastro === true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState(hint.email ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (isForgotPassword) {
        await requestPasswordResetApi(email);
        setResetSuccess(true);
        showToast("success", "E-mail de redefinição enviado com sucesso!");
      } else if (isRegister) {
        if (!nome.trim()) {
          throw new Error("Por favor, informe seu nome.");
        }
        await register(nome, email, password);
        showToast("success", "Conta criada com sucesso! Bem-vindo ao Kreato.");
      } else {
        await login(email, password);
        showToast("success", "Login realizado com sucesso!");
      }
    } catch (err: any) {
      const msg = err.message || "Ocorreu um erro ao processar sua solicitação.";
      setError(msg);
      showToast("error", msg);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = (registerMode: boolean) => {
    setIsRegister(registerMode);
    setIsForgotPassword(false);
    setResetSuccess(false);
    setError(null);
  };

  return (
    <div className="auth-page-container">
      <div className="auth-page-backdrop" />
      <div className="auth-page-content centered">
        {/* Auth Form Card */}
        <div className="auth-form-side">
          <div className="modal-card auth-page-card">
            <div className="auth-header">
              <div className="auth-logo-badge">
                <KreatoLogo size={56} />
              </div>
              <h2>
                {isForgotPassword
                  ? "Recuperar Senha"
                  : isRegister
                    ? "Criar sua Conta"
                    : "Entrar no Kreato"}
              </h2>
              <p className="auth-subtitle">
                {isForgotPassword
                  ? "Informe seu e-mail para receber as instruções de redefinição."
                  : isRegister
                    ? "Preencha seus dados para se cadastrar"
                    : "Informe suas credenciais para continuar"}
              </p>
            </div>

            {/* Tab Selector */}
            {!isForgotPassword && (
              <div className="auth-tabs">
                <button
                  type="button"
                  className={`auth-tab ${!isRegister ? "active" : ""}`}
                  onClick={() => toggleMode(false)}
                >
                  <LogIn size={16} />
                  <span>Entrar</span>
                </button>
                <button
                  type="button"
                  className={`auth-tab ${isRegister ? "active" : ""}`}
                  onClick={() => toggleMode(true)}
                >
                  <UserPlus size={16} />
                  <span>Cadastrar</span>
                </button>
              </div>
            )}

            {error && <div className="auth-error-alert">{error}</div>}

            {resetSuccess ? (
              <div style={{ textAlign: "center", padding: "1rem 0" }}>
                <p style={{ color: "var(--ink-2)", marginBottom: "1.5rem" }}>
                  Enviamos um e-mail para <strong>{email}</strong> com o link para redefinir sua senha.
                </p>

                <button
                  type="button"
                  className="submit-btn"
                  onClick={() => toggleMode(false)}
                >
                  Voltar para o Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="auth-form">
                {!isForgotPassword && isRegister && (
                  <div className="input-group">
                    <label>Nome Completo</label>
                    <div className="input-wrapper">
                      <UserIcon className="input-icon" size={18} />
                      <input
                        type="text"
                        placeholder="Ex: Guilherme Santos"
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="input-group">
                  <label>Endereço de E-mail</label>
                  <div className="input-wrapper">
                    <Mail className="input-icon" size={18} />
                    <input
                      type="email"
                      placeholder="seu.email@exemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {!isForgotPassword && (
                  <div className="input-group">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <label>Senha</label>
                      {!isRegister && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsForgotPassword(true);
                            setError(null);
                          }}
                          style={{ fontSize: "0.78rem", color: "var(--ink)", textDecoration: "underline", textUnderlineOffset: "3px", background: "none" }}
                        >
                          Esqueceu a senha?
                        </button>
                      )}
                    </div>
                    <div className="input-wrapper">
                      <Lock className="input-icon" size={18} />
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
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
                )}

                <button type="submit" className="submit-btn" disabled={isLoading}>
                  {isLoading ? (
                    <span className="btn-spinner"></span>
                  ) : isForgotPassword ? (
                    "Enviar E-mail de Recuperação"
                  ) : isRegister ? (
                    "Finalizar Cadastro"
                  ) : (
                    "Entrar"
                  )}
                </button>

                {isForgotPassword && (
                  <button
                    type="button"
                    onClick={() => toggleMode(false)}
                    style={{
                      background: "none",
                      color: "var(--ink-3)",
                      fontSize: "0.85rem",
                      textAlign: "center",
                      marginTop: "0.5rem",
                    }}
                  >
                    Cancelar e voltar ao login
                  </button>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
