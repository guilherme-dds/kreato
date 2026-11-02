import type { User, AuthResponse, RefreshTokenResponse } from "../types";

export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL as string;
  if (envUrl && envUrl.trim().length > 0 && !envUrl.includes("VITE_API_BASE_URL")) {
    return envUrl.trim().replace(/\/+$/, "");
  }
  return "/api";
}

const API_BASE_URL = getApiBaseUrl();

async function parseResponse<T>(response: Response, defaultErrorMessage: string): Promise<T> {
  const text = await response.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Resposta inválida do servidor (${response.status})`);
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || defaultErrorMessage);
  }

  return data as T;
}

export async function loginApi(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  return parseResponse<AuthResponse>(response, "Falha na autenticação");
}

export async function refreshTokenApi(refreshToken: string): Promise<RefreshTokenResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  return parseResponse<RefreshTokenResponse>(response, "Falha ao renovar sessão");
}

export async function logoutApi(token?: string | null, refreshToken?: string | null, userId?: string | null): Promise<void> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      headers,
      body: JSON.stringify({ refreshToken, userId }),
    });
  } catch {
    // Silent catch on logout network error
  }
}

export async function requestPasswordResetApi(email: string): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  return parseResponse<{ message: string }>(response, "Erro ao solicitar redefinição de senha");
}

export async function confirmPasswordResetApi(token: string, newPassword: string): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/reset/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, newPassword }),
  });

  return parseResponse<{ message: string }>(response, "Erro ao redefinir senha");
}

export async function registerApi(nome: string, email: string, password: string): Promise<{ user: User }> {
  const response = await fetch(`${API_BASE_URL}/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome, email, password }),
  });

  return parseResponse<{ user: User }>(response, "Erro ao cadastrar usuário");
}

export function isJwtExpired(tokenString?: string | null): boolean {
  if (!tokenString || typeof tokenString !== "string") return true;
  try {
    const parts = tokenString.split(".");
    if (parts.length !== 3) return true;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const payload = JSON.parse(jsonPayload);
    if (typeof payload.exp !== "number") return false;
    return Date.now() >= payload.exp * 1000 - 5000;
  } catch {
    return true;
  }
}

async function fetchWithAuth<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
  defaultErrorMessage = "Erro na requisição com o servidor"
): Promise<T> {
  let activeToken = token || localStorage.getItem("auth_token");

  // Se o token estiver expirado antes da requisição, tenta renovar antes de enviar
  if (activeToken && isJwtExpired(activeToken)) {
    const storedRefresh = localStorage.getItem("auth_refresh_token");
    if (storedRefresh) {
      try {
        const refreshData = await refreshTokenApi(storedRefresh);
        activeToken = refreshData.token;
        localStorage.setItem("auth_token", refreshData.token);
        if (refreshData.refreshToken) {
          localStorage.setItem("auth_refresh_token", refreshData.refreshToken);
        }
      } catch {
        window.dispatchEvent(new Event("auth:unauthorized"));
        throw new Error("Sessão expirada. Por favor faça login novamente.");
      }
    } else {
      window.dispatchEvent(new Event("auth:unauthorized"));
      throw new Error("Sessão expirada. Por favor faça login novamente.");
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (activeToken) {
    headers["Authorization"] = `Bearer ${activeToken}`;
  }

  let response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  // Se o servidor retornar 401, tenta renovar o token e tentar a requisição novamente uma vez
  if (response.status === 401) {
    const storedRefresh = localStorage.getItem("auth_refresh_token");
    if (storedRefresh) {
      try {
        const refreshData = await refreshTokenApi(storedRefresh);
        activeToken = refreshData.token;
        localStorage.setItem("auth_token", refreshData.token);
        if (refreshData.refreshToken) {
          localStorage.setItem("auth_refresh_token", refreshData.refreshToken);
        }
        headers["Authorization"] = `Bearer ${activeToken}`;
        response = await fetch(`${API_BASE_URL}${path}`, {
          ...options,
          headers,
        });
      } catch {
        window.dispatchEvent(new Event("auth:unauthorized"));
        throw new Error("Sessão expirada. Por favor faça login novamente.");
      }
    } else {
      window.dispatchEvent(new Event("auth:unauthorized"));
      throw new Error("Sessão expirada. Por favor faça login novamente.");
    }
  }

  if (response.status === 401) {
    window.dispatchEvent(new Event("auth:unauthorized"));
  }

  return parseResponse<T>(response, defaultErrorMessage);
}

export async function getUserProfileApi(token?: string | null): Promise<User> {
  const data = await fetchWithAuth<{ user: User }>(
    "/user/profile",
    {},
    token,
    "Erro ao buscar dados do perfil"
  );
  return data.user;
}

export async function updateUserProfileApi(token: string | null, bio: string, nome?: string): Promise<User> {
  const data = await fetchWithAuth<{ user: User }>(
    "/user/profile",
    {
      method: "PUT",
      body: JSON.stringify({ bio, nome }),
    },
    token,
    "Erro ao atualizar bio do perfil"
  );
  return data.user;
}

export async function uploadUserAvatarApi(file: File, token?: string | null): Promise<User> {
  const activeToken = token || localStorage.getItem("auth_token");
  const formData = new FormData();
  formData.append("avatar", file);

  const headers: Record<string, string> = {};
  if (activeToken) {
    headers["Authorization"] = `Bearer ${activeToken}`;
  }

  const response = await fetch(`${API_BASE_URL}/user/avatar`, {
    method: "POST",
    headers,
    body: formData,
  });

  const data = await parseResponse<{ user: User; message: string }>(
    response,
    "Erro ao enviar foto de perfil para o MinIO"
  );
  return data.user;
}

export async function removeUserAvatarApi(token?: string | null): Promise<User> {
  const data = await fetchWithAuth<{ user: User }>(
    "/user/avatar",
    { method: "DELETE" },
    token,
    "Erro ao remover foto de perfil"
  );
  return data.user;
}

/* ==========================================================================
   STRIPE & PREMIUM SUBSCRIPTION API
   ========================================================================== */

export async function createStripeCheckoutSessionApi(token?: string | null): Promise<{ url: string; mockActivated?: boolean; message?: string }> {
  return fetchWithAuth<{ url: string; mockActivated?: boolean; message?: string }>(
    "/stripe/create-checkout-session",
    { method: "POST" },
    token,
    "Erro ao iniciar checkout do Stripe"
  );
}

export async function toggleMockPremiumApi(token?: string | null): Promise<{ user: User; message: string }> {
  return fetchWithAuth<{ user: User; message: string }>(
    "/stripe/mock-upgrade",
    { method: "POST" },
    token,
    "Erro ao alternar status do Plano Premium"
  );
}

export async function verifyStripeSessionApi(token?: string | null, sessionId?: string | null): Promise<{ user: User; success: boolean }> {
  return fetchWithAuth<{ user: User; success: boolean }>(
    "/stripe/verify-session",
    {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    },
    token,
    "Erro ao verificar pagamento do Stripe"
  );
}

export async function cancelStripeSubscriptionApi(token?: string | null): Promise<{ user: User; message: string }> {
  return fetchWithAuth<{ user: User; message: string }>(
    "/stripe/cancel",
    { method: "POST" },
    token,
    "Erro ao cancelar assinatura do Stripe"
  );
}
