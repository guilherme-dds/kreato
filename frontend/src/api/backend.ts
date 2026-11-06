import type {
  User,
  PlanResource,
  UsageResponse,
  BillingPlansResponse,
  CheckoutResponse,
  PaidPlan,
  Plan,
  DashboardData,
  AuthResponse,
  RefreshTokenResponse,
  Idea,
  IdeaFilters,
  IdeaInput,
  IdeasResponse,
  ContentCreateInput,
  AdminMetrics,
  AssignableRole,
  LogStats,
  ContentComment,
  ContentDetail,
  ContentFilters,
  ContentInput,
  ContentMoveInput,
  ContentsResponse,
  Invite,
  InviteDelivery,
  InvitePreview,
  TeamMember,
  TeamResponse,
  WorkspaceSummary,
  Attachment,
  AttachmentsResponse,
  StorageUsage,
  ContentMetricsResponse,
  MetricInput,
  MetricSnapshot,
  MetricsSummary,
  MetricsSummaryFilters,
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

const PLAN_RESOURCES: PlanResource[] = ["ideias", "conteudosAtivos", "armazenamentoMB", "historicoMetricasDias", "membros"];

/** Recurso cujo limite foi atingido (vem no corpo do PLAN_LIMIT_REACHED) */
export function planLimitResource(error: unknown): PlanResource | undefined {
  if (!(error instanceof ApiError)) return undefined;
  const resource = error.data.resource;
  return PLAN_RESOURCES.find((item) => item === resource);
}

export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL as string;
  if (envUrl && envUrl.trim().length > 0 && !envUrl.includes("VITE_API_BASE_URL")) {
    return envUrl.trim().replace(/\/+$/, "");
  }
  return "/api";
}

const API_BASE_URL = getApiBaseUrl();

/* ==========================================================================
   WORKSPACE SELECIONADO (enviado no header X-Workspace-Id)
   ========================================================================== */

const WORKSPACE_STORAGE_KEY = "kreato_workspace";

function storedUserId(): string | null {
  try {
    return JSON.parse(localStorage.getItem("auth_user") || "null")?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Workspace escolhido no seletor. A escolha fica vinculada ao usuário: se outra conta entrar
 * no mesmo navegador, ela começa no próprio workspace pessoal. null = workspace pessoal (sem header).
 */
export function getSelectedWorkspaceId(): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY) || "null");
    if (!saved || typeof saved.workspaceId !== "string") return null;
    return saved.userId === storedUserId() ? saved.workspaceId : null;
  } catch {
    return null;
  }
}

export function setSelectedWorkspaceId(workspaceId: string | null): void {
  try {
    if (workspaceId) {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ userId: storedUserId(), workspaceId }));
    } else {
      localStorage.removeItem(WORKSPACE_STORAGE_KEY);
    }
  } catch {
    // Sem storage disponível: segue no workspace pessoal
  }
}

/** Disparado quando o servidor recusa o workspace salvo (ex.: a pessoa foi removida da equipe) */
export const WORKSPACE_LOST_EVENT = "workspace:lost";

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

  const workspaceId = getSelectedWorkspaceId();
  if (workspaceId && !headers["X-Workspace-Id"]) {
    headers["X-Workspace-Id"] = workspaceId;
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

  // Perdeu o acesso ao workspace salvo: descarta a seleção para as próximas requisições
  if (response.status === 403 && workspaceId) {
    const body = await response.clone().json().catch(() => null);
    if (body?.code === "WORKSPACE_FORBIDDEN" && getSelectedWorkspaceId() === workspaceId) {
      setSelectedWorkspaceId(null);
      window.dispatchEvent(new CustomEvent(WORKSPACE_LOST_EVENT, { detail: { workspaceId } }));
    }
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

export async function getUsageApi(token?: string | null): Promise<UsageResponse> {
  return fetchWithAuth<UsageResponse>("/user/usage", {}, token, "Erro ao carregar o uso do plano");
}

export async function getBillingPlansApi(token?: string | null): Promise<BillingPlansResponse> {
  return fetchWithAuth<BillingPlansResponse>("/stripe/plans", {}, token, "Erro ao carregar os planos");
}

export async function createStripeCheckoutSessionApi(plano: PaidPlan, token?: string | null): Promise<CheckoutResponse> {
  return fetchWithAuth<CheckoutResponse>(
    "/stripe/create-checkout-session",
    { method: "POST", body: JSON.stringify({ plano }) },
    token,
    "Erro ao iniciar checkout do Stripe"
  );
}

/** Ativa um plano sem cartão (somente fora de produção) */
export async function activateMockPlanApi(plano: Plan, token?: string | null): Promise<{ user: User; message: string }> {
  return fetchWithAuth<{ user: User; message: string }>(
    "/stripe/mock-upgrade",
    { method: "POST", body: JSON.stringify({ plano }) },
    token,
    "Erro ao alternar o plano"
  );
}

export async function verifyStripeSessionApi(
  token?: string | null,
  sessionId?: string | null,
  plano?: string | null
): Promise<{ user: User; success: boolean }> {
  return fetchWithAuth<{ user: User; success: boolean }>(
    "/stripe/verify-session",
    {
      method: "POST",
      body: JSON.stringify({ sessionId, plano }),
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
   PAINEL ADMINISTRATIVO API (apenas role admin)
   ========================================================================== */

export async function getAdminMetricsApi(dias: number, token?: string | null): Promise<AdminMetrics> {
  return fetchWithAuth<AdminMetrics>(`/admin/metricas?dias=${dias}`, {}, token, "Erro ao carregar métricas da plataforma");
}

/** Servido pelo log-service (o proxy encaminha /api/logs para ele) */
export async function getLogStatsApi(dias: number, token?: string | null): Promise<LogStats> {
  return fetchWithAuth<LogStats>(`/logs/stats?dias=${dias}`, {}, token, "Erro ao carregar estatísticas de uso");
}

/* ==========================================================================
   WORKSPACES, EQUIPE E CONVITES API
   ========================================================================== */

export async function getWorkspacesApi(token?: string | null): Promise<WorkspaceSummary[]> {
  const data = await fetchWithAuth<{ workspaces: WorkspaceSummary[] }>("/workspaces", {}, token, "Erro ao carregar workspaces");
  return data.workspaces;
}

export async function getTeamApi(token?: string | null): Promise<TeamResponse> {
  return fetchWithAuth<TeamResponse>("/membros", {}, token, "Erro ao carregar a equipe");
}

export async function updateMemberRoleApi(memberId: number, papel: AssignableRole, token?: string | null): Promise<TeamMember> {
  const data = await fetchWithAuth<{ membro: TeamMember }>(
    `/membros/${memberId}`,
    { method: "PATCH", body: JSON.stringify({ papel }) },
    token,
    "Erro ao alterar papel"
  );
  return data.membro;
}

export async function removeMemberApi(memberId: number, token?: string | null): Promise<void> {
  await fetchWithAuth<void>(`/membros/${memberId}`, { method: "DELETE" }, token, "Erro ao remover membro");
}

export async function leaveWorkspaceApi(token?: string | null): Promise<void> {
  await fetchWithAuth<void>("/membros/sair", { method: "POST" }, token, "Erro ao sair do workspace");
}

export async function getInvitesApi(token?: string | null): Promise<Invite[]> {
  const data = await fetchWithAuth<{ convites: Invite[] }>("/convites", {}, token, "Erro ao carregar convites");
  return data.convites;
}

export async function createInviteApi(email: string, papel: AssignableRole, token?: string | null): Promise<InviteDelivery> {
  return fetchWithAuth<InviteDelivery>(
    "/convites",
    { method: "POST", body: JSON.stringify({ email, papel }) },
    token,
    "Erro ao enviar convite"
  );
}

export async function resendInviteApi(inviteId: number, token?: string | null): Promise<InviteDelivery> {
  return fetchWithAuth<InviteDelivery>(`/convites/${inviteId}/reenviar`, { method: "POST" }, token, "Erro ao reenviar convite");
}

export async function revokeInviteApi(inviteId: number, token?: string | null): Promise<void> {
  await fetchWithAuth<void>(`/convites/${inviteId}`, { method: "DELETE" }, token, "Erro ao revogar convite");
}

/** Público: dados do convite para a tela de aceite (não exige login) */
export async function getInvitePreviewApi(inviteToken: string): Promise<InvitePreview> {
  const response = await fetch(`${API_BASE_URL}/convites/token/${encodeURIComponent(inviteToken)}`);
  const data = await parseResponse<{ convite: InvitePreview }>(response, "Convite não encontrado");
  return data.convite;
}

export async function acceptInviteApi(
  inviteToken: string,
  token?: string | null
): Promise<{ workspace: { id: string; nome: string }; papel: AssignableRole }> {
  return fetchWithAuth(
    "/convites/aceitar",
    { method: "POST", body: JSON.stringify({ token: inviteToken }) },
    token,
    "Erro ao aceitar convite"
  );
}

/* ==========================================================================
   REVIEW (COMENTÁRIOS E APROVAÇÃO DE ROTEIRO) API
   ========================================================================== */

export async function getCommentsApi(contentId: number, token?: string | null): Promise<ContentComment[]> {
  const data = await fetchWithAuth<{ comentarios: ContentComment[] }>(
    `/conteudos/${contentId}/comentarios`,
    {},
    token,
    "Erro ao carregar comentários"
  );
  return data.comentarios;
}

export async function createCommentApi(contentId: number, texto: string, token?: string | null): Promise<ContentComment> {
  const data = await fetchWithAuth<{ comentario: ContentComment }>(
    `/conteudos/${contentId}/comentarios`,
    { method: "POST", body: JSON.stringify({ texto }) },
    token,
    "Erro ao enviar comentário"
  );
  return data.comentario;
}

export async function updateCommentApi(
  commentId: number,
  input: { texto?: string; resolvido?: boolean },
  token?: string | null
): Promise<ContentComment> {
  const data = await fetchWithAuth<{ comentario: ContentComment }>(
    `/comentarios/${commentId}`,
    { method: "PATCH", body: JSON.stringify(input) },
    token,
    "Erro ao atualizar comentário"
  );
  return data.comentario;
}

export async function deleteCommentApi(commentId: number, token?: string | null): Promise<void> {
  await fetchWithAuth<void>(`/comentarios/${commentId}`, { method: "DELETE" }, token, "Erro ao excluir comentário");
}

export async function approveScriptApi(contentId: number, texto: string, token?: string | null): Promise<string> {
  const data = await fetchWithAuth<{ message: string }>(
    `/conteudos/${contentId}/aprovar-roteiro`,
    { method: "POST", body: JSON.stringify(texto ? { texto } : {}) },
    token,
    "Erro ao aprovar roteiro"
  );
  return data.message;
}

export async function requestChangesApi(contentId: number, texto: string, token?: string | null): Promise<string> {
  const data = await fetchWithAuth<{ message: string }>(
    `/conteudos/${contentId}/solicitar-ajustes`,
    { method: "POST", body: JSON.stringify({ texto }) },
    token,
    "Erro ao pedir ajustes"
  );
  return data.message;
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

/* ==========================================================================
   CONTENT METRICS API
   ========================================================================== */

export async function getMetricsSummaryApi(
  filters: MetricsSummaryFilters = {},
  token?: string | null
): Promise<MetricsSummary> {
  return fetchWithAuth<MetricsSummary>(`/metricas/resumo${toQueryString(filters)}`, {}, token, "Erro ao carregar métricas");
}

export async function getContentMetricsApi(contentId: number, token?: string | null): Promise<ContentMetricsResponse> {
  return fetchWithAuth<ContentMetricsResponse>(`/conteudos/${contentId}/metricas`, {}, token, "Erro ao carregar métricas");
}

export async function createMetricApi(contentId: number, input: MetricInput, token?: string | null): Promise<MetricSnapshot> {
  const data = await fetchWithAuth<{ metrica: MetricSnapshot }>(
    `/conteudos/${contentId}/metricas`,
    { method: "POST", body: JSON.stringify(input) },
    token,
    "Erro ao registrar métricas"
  );
  return data.metrica;
}

export async function deleteMetricApi(metricId: number, token?: string | null): Promise<void> {
  await fetchWithAuth<void>(`/metricas/${metricId}`, { method: "DELETE" }, token, "Erro ao excluir métrica");
}

/* ==========================================================================
   CREATOR DASHBOARD (workspace atual)
   ========================================================================== */
/** Segunda-feira 00:00 no fuso do navegador: a semana da meta segue o calendário do criador */
export function localWeekStart(now = new Date()): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

export async function getDashboardApi(token?: string | null): Promise<DashboardData> {
  const query = toQueryString({ inicioSemana: localWeekStart().toISOString() });
  return fetchWithAuth<DashboardData>(`/dashboard${query}`, {}, token, "Erro ao carregar o painel");
}

export async function updateWeeklyGoalApi(metaSemanal: number, token?: string | null): Promise<number> {
  const data = await fetchWithAuth<{ workspace: { metaSemanal: number } }>(
    "/workspaces/current",
    { method: "PATCH", body: JSON.stringify({ metaSemanal }) },
    token,
    "Erro ao atualizar a meta semanal"
  );
  return data.workspace.metaSemanal;
}
