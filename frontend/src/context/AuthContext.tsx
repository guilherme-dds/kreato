import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { User, RefreshTokenResponse } from "../types";
import {
  AUTH_TOKEN_EVENT,
  getAccessToken,
  isJwtExpired,
  loginApi,
  logoutApi,
  refreshTokenApi,
  registerApi,
} from "../api/backend";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (nome: string, email: string, pass: string) => Promise<void>;
  refreshSession: () => Promise<string | null>;
  logout: () => void;
  updateUser: (updatedFields: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Só os dados de exibição do usuário ficam no navegador; tokens nunca */
const USER_KEY = "auth_user";

function readStoredUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

function storeUser(user: User | null): void {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    // sem storage: a sessão segue só em memória
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const updateUser = useCallback((updatedFields: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return null;
      const newUser = { ...prev, ...updatedFields };
      storeUser(newUser);
      return newUser;
    });
  }, []);

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
    storeUser(null);
  }, []);

  const logout = useCallback(() => {
    const currentUserId = user?.id ?? readStoredUser()?.id ?? null;
    logoutApi(getAccessToken() ?? token, currentUserId);
    clearSession();
  }, [token, user, clearSession]);

  const refreshSession = useCallback(async (): Promise<string | null> => {
    try {
      const data = await refreshTokenApi();
      return data.token;
    } catch (err) {
      console.error("Erro ao renovar token de acesso:", err);
      logout();
      return null;
    }
  }, [logout]);

  // Toda renovação (inclusive as feitas pelas requisições da API) atualiza o estado aqui
  useEffect(() => {
    const handleToken = (event: Event) => {
      const data = (event as CustomEvent<RefreshTokenResponse>).detail;
      setToken(data.token);
      if (data.user) {
        setUser(data.user);
        storeUser(data.user);
      }
    };
    window.addEventListener(AUTH_TOKEN_EVENT, handleToken);
    return () => window.removeEventListener(AUTH_TOKEN_EVENT, handleToken);
  }, []);

  // Listener global para eventos de requisição não autorizada (401)
  useEffect(() => {
    const handleUnauthorized = () => {
      logout();
    };
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
    };
  }, [logout]);

  // Restauração da sessão ao abrir a página: o cookie httpOnly gera um access token novo.
  // Só tenta quando há sinal de login anterior, para não disparar um 401 em toda visita anônima.
  useEffect(() => {
    const storedUser = readStoredUser();
    const hadLegacySession = (() => {
      try {
        return localStorage.getItem("auth_refresh_token") !== null;
      } catch {
        return false;
      }
    })();

    if (!storedUser && !hadLegacySession) {
      setIsLoading(false);
      return;
    }

    refreshTokenApi()
      .then((data) => {
        setToken(data.token);
        const restored = data.user ?? storedUser;
        setUser(restored);
        storeUser(restored);
      })
      .catch(() => {
        clearSession();
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [clearSession]);

  // Renova pouco antes de o access token vencer, para a próxima ação não esperar
  useEffect(() => {
    if (!token) return;

    const checkInterval = setInterval(() => {
      const current = getAccessToken() ?? token;
      if (isJwtExpired(current)) {
        refreshSession();
      }
    }, 10000);

    return () => clearInterval(checkInterval);
  }, [token, refreshSession]);

  const login = async (email: string, pass: string) => {
    const data = await loginApi(email, pass);
    setToken(data.token);
    setUser(data.user);
    storeUser(data.user);
  };

  const register = async (nome: string, email: string, pass: string) => {
    await registerApi(nome, email, pass);
    // Auto login after registration
    await login(email, pass);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        isLoading,
        login,
        register,
        refreshSession,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  }
  return context;
}
