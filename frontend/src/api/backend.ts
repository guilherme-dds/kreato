import type {
  User,
  AuthResponse,
  RefreshTokenResponse,
  Idea,
  IdeaFilters,
  IdeaInput,
  IdeasResponse,
  ContentCreateInput,
  ContentDetail,
  ContentFilters,
  ContentInput,
  ContentMoveInput,
  ContentsResponse,
  Attachment,
  AttachmentsResponse,
  StorageUsage,
} from "../types";

/** Erro retornado pela API, com o status HTTP e o código de negócio (ex.: PLAN_LIMIT_REACHED) */
export class ApiError extends Error {
  status: number;
  code: string | undefined;
  /** Corpo completo da resposta de erro (ex.: { conteudoId } em IDEA_ALREADY_CONVERTED) */
  data: Record<string, unknown>;

  constructor(message: string, status: number, code?: string, data: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export function isPlanLimitError(error: unknown): boolean {
  return error instanceof ApiError && (error.code === "PLAN_LIMIT_REACHED" || error.code === "PLAN_REQUIRED");
}

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
    throw new ApiError(data.error || data.message || defaultErrorMessage, response.status, data.code, data);
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

/**
 * Requisição autenticada que devolve a Response crua (útil para downloads em blob).
 * Renova o token antes de enviar se ele já expirou, e repete uma vez após um 401.
 */
async function authorizedFetch(path: string, options: RequestInit = {}, token?: string | null): Promise<Response> {
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

  // Em uploads (FormData) o navegador define o Content-Type com o boundary do multipart
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
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

  return response;
}

async function fetchWithAuth<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
  defaultErrorMessage = "Erro na requisição com o servidor"
): Promise<T> {
  const response = await authorizedFetch(path, options, token);
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
    "Erro ao alternar o plano"
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

/* ==========================================================================
   IDEAS API (workspace atual)
   ========================================================================== */

/** Monta a query string ignorando filtros vazios */
function toQueryString(filters: object): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (typeof value === "string" && value) params.set(key, value);
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function getIdeasApi(filters: IdeaFilters = {}, token?: string | null): Promise<IdeasResponse> {
  return fetchWithAuth<IdeasResponse>(`/ideias${toQueryString(filters)}`, {}, token, "Erro ao carregar ideias");
}

export async function createIdeaApi(input: IdeaInput, token?: string | null): Promise<Idea> {
  const data = await fetchWithAuth<{ ideia: Idea }>(
    "/ideias",
    { method: "POST", body: JSON.stringify(input) },
    token,
    "Erro ao criar ideia"
  );
  return data.ideia;
}

export async function updateIdeaApi(id: number, input: Partial<IdeaInput>, token?: string | null): Promise<Idea> {
  const data = await fetchWithAuth<{ ideia: Idea }>(
    `/ideias/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
    token,
    "Erro ao atualizar ideia"
  );
  return data.ideia;
}

export async function deleteIdeaApi(id: number, token?: string | null): Promise<void> {
  await fetchWithAuth<void>(`/ideias/${id}`, { method: "DELETE" }, token, "Erro ao excluir ideia");
}

/** Leva uma ideia para o pipeline (409 IDEA_ALREADY_CONVERTED se já foi convertida) */
export async function convertIdeaApi(ideaId: number, token?: string | null): Promise<ContentDetail> {
  const data = await fetchWithAuth<{ conteudo: ContentDetail }>(
    `/ideias/${ideaId}/converter`,
    { method: "POST", body: JSON.stringify({}) },
    token,
    "Erro ao levar ideia para o pipeline"
  );
  return data.conteudo;
}

/* ==========================================================================
   CONTENT PIPELINE API (workspace atual)
   ========================================================================== */

export async function getContentsApi(filters: ContentFilters = {}, token?: string | null): Promise<ContentsResponse> {
  return fetchWithAuth<ContentsResponse>(`/conteudos${toQueryString(filters)}`, {}, token, "Erro ao carregar conteúdos");
}

export async function getContentApi(id: number, token?: string | null): Promise<ContentDetail> {
  const data = await fetchWithAuth<{ conteudo: ContentDetail }>(`/conteudos/${id}`, {}, token, "Erro ao carregar conteúdo");
  return data.conteudo;
}

export async function createContentApi(input: ContentCreateInput, token?: string | null): Promise<ContentDetail> {
  const data = await fetchWithAuth<{ conteudo: ContentDetail }>(
    "/conteudos",
    { method: "POST", body: JSON.stringify(input) },
    token,
    "Erro ao criar conteúdo"
  );
  return data.conteudo;
}

export async function updateContentApi(
  id: number,
  input: Partial<ContentInput>,
  token?: string | null
): Promise<ContentDetail> {
  const data = await fetchWithAuth<{ conteudo: ContentDetail }>(
    `/conteudos/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
    token,
    "Erro ao salvar conteúdo"
  );
  return data.conteudo;
}

export async function moveContentApi(id: number, input: ContentMoveInput, token?: string | null): Promise<ContentDetail> {
  const data = await fetchWithAuth<{ conteudo: ContentDetail }>(
    `/conteudos/${id}/etapa`,
    { method: "PATCH", body: JSON.stringify(input) },
    token,
    "Erro ao mover conteúdo"
  );
  return data.conteudo;
}

export async function deleteContentApi(id: number, token?: string | null): Promise<void> {
  await fetchWithAuth<void>(`/conteudos/${id}`, { method: "DELETE" }, token, "Erro ao excluir conteúdo");
}

/* ==========================================================================
   CONTENT ATTACHMENTS API
   ========================================================================== */

export async function getAttachmentsApi(contentId: number, token?: string | null): Promise<AttachmentsResponse> {
  return fetchWithAuth<AttachmentsResponse>(`/conteudos/${contentId}/anexos`, {}, token, "Erro ao carregar anexos");
}

export async function uploadAttachmentApi(
  contentId: number,
  file: File,
  token?: string | null
): Promise<{ anexo: Attachment; uso: StorageUsage }> {
  const formData = new FormData();
  formData.append("arquivo", file);
  return fetchWithAuth<{ anexo: Attachment; uso: StorageUsage }>(
    `/conteudos/${contentId}/anexos`,
    { method: "POST", body: formData },
    token,
    "Erro ao enviar anexo"
  );
}

/** Baixa o arquivo com autenticação (o MinIO não é exposto ao navegador) */
export async function downloadAttachmentBlob(attachmentId: number, token?: string | null): Promise<Blob> {
  const response = await authorizedFetch(`/anexos/${attachmentId}/arquivo`, {}, token);
  if (!response.ok) await parseResponse<never>(response, "Erro ao baixar anexo");
  return response.blob();
}

export async function deleteAttachmentApi(attachmentId: number, token?: string | null): Promise<void> {
  await fetchWithAuth<void>(`/anexos/${attachmentId}`, { method: "DELETE" }, token, "Erro ao excluir anexo");
}
