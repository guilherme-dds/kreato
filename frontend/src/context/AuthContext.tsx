import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { User, AuthResponse } from "../types";
import { loginApi, registerApi, refreshTokenApi, logoutApi, isJwtExpired } from "../api/backend";

interface AuthContextType {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (nome: string, email: string, pass: string) => Promise<void>;
  refreshSession: () => Promise<string | null>;
  logout: () => void;
  updateUser: (updatedFields: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const updateUser = useCallback((updatedFields: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return null;
      const newUser = { ...prev, ...updatedFields };
      localStorage.setItem("auth_user", JSON.stringify(newUser));
      return newUser;
    });
  }, []);

  const logout = useCallback(() => {
    const currentToken = token || localStorage.getItem("auth_token");
    const currentRefresh = refreshToken || localStorage.getItem("auth_refresh_token");
    const storedUserStr = localStorage.getItem("auth_user");
    let currentUserId = user?.id;
    if (!currentUserId && storedUserStr) {
      try {
        currentUserId = JSON.parse(storedUserStr)?.id;
      } catch { }
    }

    logoutApi(currentToken, currentRefresh, currentUserId);

    setToken(null);
    setRefreshToken(null);
    setUser(null);
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_refresh_token");
    localStorage.removeItem("auth_user");
  }, [token, refreshToken, user]);

  const refreshSession = useCallback(async (): Promise<string | null> => {
    const storedRefreshToken = refreshToken || localStorage.getItem("auth_refresh_token");
    if (!storedRefreshToken) {
      logout();
      return null;
    }

    try {
      const data = await refreshTokenApi(storedRefreshToken);
      setToken(data.token);
      localStorage.setItem("auth_token", data.token);

      if (data.refreshToken) {
        setRefreshToken(data.refreshToken);
        localStorage.setItem("auth_refresh_token", data.refreshToken);
      }

      return data.token;
    } catch (err) {
      console.error("Erro ao renovar token de acesso:", err);
      logout();
      return null;
    }
  }, [refreshToken, logout]);

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

  // Restauração inicial de sessão com verificação proativa do JWT.
  // Roda apenas na montagem: depender de `logout` (recriado a cada mudança de user/token)
  // fazia o efeito reexecutar e chamar setUser em loop infinito.
  useEffect(() => {
    const storedToken = localStorage.getItem("auth_token");
    const storedRefreshToken = localStorage.getItem("auth_refresh_token");
    const storedUser = localStorage.getItem("auth_user");

    if (storedToken && storedUser) {
      if (isJwtExpired(storedToken)) {
        if (storedRefreshToken) {
          refreshTokenApi(storedRefreshToken)
            .then((data) => {
              setToken(data.token);
              localStorage.setItem("auth_token", data.token);
              if (data.refreshToken) {
                setRefreshToken(data.refreshToken);
                localStorage.setItem("auth_refresh_token", data.refreshToken);
              }
              setUser(JSON.parse(storedUser));
            })
            .catch(() => {
              logout();
            })
            .finally(() => {
              setIsLoading(false);
            });
          return;
        } else {
          logout();
          setIsLoading(false);
          return;
        }
      } else {
        try {
          setToken(storedToken);
          setRefreshToken(storedRefreshToken);
          setUser(JSON.parse(storedUser));
        } catch (err) {
          console.error("Erro ao restaurar sessão:", err);
          logout();
        }
      }
    }
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Monitoramento periódico da validade do JWT para logout/refresh automático
  useEffect(() => {
    if (!token) return;

    const checkInterval = setInterval(() => {
      const currentToken = token || localStorage.getItem("auth_token");
      if (currentToken && isJwtExpired(currentToken)) {
        refreshSession().catch(() => {
          logout();
        });
      }
    }, 10000);

    return () => clearInterval(checkInterval);
  }, [token, refreshSession, logout]);

  const login = async (email: string, pass: string) => {
    const data: AuthResponse = await loginApi(email, pass);
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem("auth_token", data.token);
    localStorage.setItem("auth_user", JSON.stringify(data.user));

    if (data.refreshToken) {
      setRefreshToken(data.refreshToken);
      localStorage.setItem("auth_refresh_token", data.refreshToken);
    }
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
        refreshToken,
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
