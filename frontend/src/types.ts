export type Plan = "FREE" | "CREATOR" | "STUDIO";

export interface User {
  id: string;
  nome?: string;
  email: string;
  role?: "admin" | "creator" | string;
  plano?: Plan;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  bio?: string;
  fotoPerfil?: string | null;
}

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken?: string;
}

export interface RefreshTokenResponse {
  token: string;
  refreshToken?: string;
}

export type Platform = "TIKTOK" | "INSTAGRAM" | "YOUTUBE" | "OUTRA";
export type IdeaStatus = "NOVA" | "EM_DESENVOLVIMENTO" | "ARQUIVADA";

export interface Idea {
  id: number;
  titulo: string;
  gancho: string | null;
  descricao: string | null;
  legenda: string | null;
  plataforma: Platform | null;
  tags: string[];
  status: IdeaStatus;
  criadoEm: string;
  atualizadoEm: string;
  autor: { id: string; nome: string; fotoPerfil: string | null } | null;
}

export interface IdeaInput {
  titulo: string;
  gancho?: string | null;
  descricao?: string | null;
  legenda?: string | null;
  plataforma?: Platform | null;
  tags?: string[];
  status?: IdeaStatus;
}

export interface IdeaFilters {
  status?: IdeaStatus | "";
  plataforma?: Platform | "";
  tag?: string;
  busca?: string;
}

export interface IdeasResponse {
  ideias: Idea[];
  uso: { ideiasAtivas: number; limite: number | null };
}

export type ContentStage = "IDEIA" | "ROTEIRO" | "GRAVACAO" | "EDICAO" | "AGENDADO" | "PUBLICADO";
export type ContentFormat = "VIDEO_CURTO" | "VIDEO_LONGO" | "CARROSSEL" | "IMAGEM" | "STORY" | "LIVE";

export interface ContentAuthor {
  id: string;
  nome: string;
  fotoPerfil: string | null;
}

/** Conteúdo como vem na listagem do kanban (sem roteiro e legenda) */
export interface Content {
  id: number;
  titulo: string;
  etapa: ContentStage;
  posicao: number;
  plataforma: Platform | null;
  formato: ContentFormat | null;
  hashtags: string[];
  dataPublicacao: string | null;
  urlPublicacao: string | null;
  ideiaId: number | null;
  criadoEm: string;
  atualizadoEm: string;
  autor: ContentAuthor | null;
  roteiroAprovadoEm: string | null;
  /** Comentários de revisão ainda não resolvidos */
  comentariosAbertos: number;
  permissoes: ContentPermissions;
}

export type WorkspaceRole = "DONO" | "GESTOR" | "ROTEIRISTA" | "EDITOR";
/** Papéis atribuíveis por convite ou alteração (o DONO é único e fixo) */
export type AssignableRole = Exclude<WorkspaceRole, "DONO">;

/** Workspace do qual o usuário participa (GET /workspaces) */
export interface WorkspaceSummary {
  id: string;
  nome: string;
  pessoal: boolean;
  papel: WorkspaceRole;
  /** Plano do dono: é ele que define os limites do workspace */
  plano: Plan;
  totalMembros: number;
}

export interface TeamMember {
  id: number;
  papel: WorkspaceRole;
  criadoEm: string;
  usuario: { id: string; nome: string; email: string; fotoPerfil: string | null };
  souEu?: boolean;
}

export interface TeamResponse {
  membros: TeamMember[];
  meuPapel: WorkspaceRole;
  podeGerenciar: boolean;
  vagas: { membros: number; convitesPendentes: number; limite: number | null };
}

export type InviteState = "PENDENTE" | "EXPIRADO" | "ACEITO" | "REVOGADO";

export interface Invite {
  id: number;
  email: string;
  papel: AssignableRole;
  status: string;
  estado: InviteState;
  expiraEm: string;
  criadoEm: string;
  convidadoPor: { id: string; nome: string } | null;
}

/** Resultado de criar/reenviar convite: o link só é devolvido nesse momento */
export interface InviteDelivery {
  convite: Invite;
  link: string;
  emailEnviado: boolean;
}

export interface InvitePreview {
  email: string;
  papel: AssignableRole;
  estado: InviteState;
  expiraEm: string;
  workspace: string;
  convidadoPor: string | null;
}

/** O que o usuário atual pode fazer com um conteúdo (calculado pelo backend) */
export interface ContentPermissions {
  papel: WorkspaceRole;
  editarTexto: boolean;
  editarPublicacao: boolean;
  moverPara: ContentStage[];
  aprovarRoteiro: boolean;
  solicitarAjustes: boolean;
  excluir: boolean;
  moderarComentarios: boolean;
}

export interface ContentDetail extends Content {
  roteiro: string | null;
  legenda: string | null;
  ideia: { id: number; titulo: string } | null;
  roteiroAprovadoPor: { id: string; nome: string } | null;
}

export type CommentType = "COMENTARIO" | "APROVACAO" | "AJUSTE";

export interface ContentComment {
  id: number;
  texto: string;
  tipo: CommentType;
  etapa: ContentStage;
  resolvido: boolean;
  resolvidoEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
  autor: ContentAuthor | null;
  resolvidoPor: { id: string; nome: string } | null;
  podeEditar: boolean;
  podeExcluir: boolean;
  podeResolver: boolean;
}

export interface ContentInput {
  titulo: string;
  roteiro?: string | null;
  legenda?: string | null;
  hashtags?: string[];
  plataforma?: Platform | null;
  formato?: ContentFormat | null;
  dataPublicacao?: string | null;
  urlPublicacao?: string | null;
}

export interface ContentCreateInput extends ContentInput {
  etapa?: ContentStage;
}

export interface ContentMoveInput {
  etapa: ContentStage;
  posicao?: number;
  dataPublicacao?: string | null;
  urlPublicacao?: string | null;
}

export interface ContentFilters {
  etapa?: string;
  plataforma?: Platform | "";
  formato?: ContentFormat | "";
  busca?: string;
  de?: string;
  ate?: string;
}

export interface ContentsResponse {
  conteudos: Content[];
  uso: { conteudosAtivos: number; limite: number | null };
  permissoes: { papel: WorkspaceRole; criarEm: ContentStage[] };
}

export interface Attachment {
  id: number;
  conteudoId: number;
  nomeOriginal: string;
  tipoMime: string;
  tamanhoBytes: number;
  criadoEm: string;
  autor: { id: string; nome: string } | null;
}

export interface StorageUsage {
  usadoBytes: number;
  limiteBytes: number;
}

export interface AttachmentsResponse {
  anexos: Attachment[];
  uso: StorageUsage;
}

export interface MetricValues {
  visualizacoes: number;
  curtidas: number;
  comentarios: number;
  compartilhamentos: number;
  salvamentos: number;
  alcance: number | null;
  seguidoresGanhos: number | null;
}

export interface MetricSnapshot extends MetricValues {
  id: number;
  coletadoEm: string;
  criadoEm: string;
  taxaEngajamento: number | null;
  registradoPor: { id: string; nome: string } | null;
}

export interface MetricInput extends Partial<MetricValues> {
  coletadoEm?: string;
}

export interface ContentMetricsResponse {
  metricas: MetricSnapshot[];
  ultima: MetricSnapshot | null;
  historico: { dias: number | null; ocultas: number };
}

export interface MetricTotals {
  conteudosPublicados: number;
  conteudosComMetricas: number;
  visualizacoes: number;
  curtidas: number;
  comentarios: number;
  compartilhamentos: number;
  salvamentos: number;
  seguidoresGanhos: number;
  taxaEngajamento: number | null;
}

export interface MetricsSummaryContent {
  id: number;
  titulo: string;
  plataforma: Platform | null;
  formato: ContentFormat | null;
  dataPublicacao: string | null;
  urlPublicacao: string | null;
  metrica: MetricSnapshot | null;
  taxaEngajamento: number | null;
}

export interface MetricsSummary {
  periodo: { de: string; ate: string; limitadoPeloPlano: boolean; historicoDias: number | null };
  totais: MetricTotals;
  porPlataforma: (MetricTotals & { plataforma: Platform | "SEM_PLATAFORMA" })[];
  porFormato: (MetricTotals & { formato: ContentFormat | "SEM_FORMATO" })[];
  conteudos: MetricsSummaryContent[];
}

export interface MetricsSummaryFilters {
  de?: string;
  ate?: string;
  plataforma?: Platform | "";
}


/* ==========================================================================
   CREATOR DASHBOARD
   ========================================================================== */
export interface WeekProgress {
  inicio: string;
  publicados: number;
  atingiu: boolean;
}

export interface WeeklyGoal {
  meta: number;
  inicioSemana: string;
  fimSemana: string;
  publicadosSemana: number;
  semanaAtualConcluida: boolean;
  /** Semanas consecutivas com a meta cumprida (a atual só conta depois de cumprida) */
  sequencia: number;
  /** Últimas 8 semanas, da mais antiga para a atual */
  semanas: WeekProgress[];
  podeEditar: boolean;
}

export interface DashboardAgendaItem {
  id: number;
  titulo: string;
  etapa: ContentStage;
  plataforma: Platform | null;
  formato: ContentFormat | null;
  dataPublicacao: string;
}

export interface DashboardData {
  meta: WeeklyGoal;
  pipeline: { porEtapa: Record<Exclude<ContentStage, "PUBLICADO">, number>; ativos: number };
  agenda: { atrasados: DashboardAgendaItem[]; totalAtrasados: number; proximos: DashboardAgendaItem[]; dias: number };
  ideias: { novas: number; recentes: { id: number; titulo: string; plataforma: Platform | null; criadoEm: string }[] };
  desempenho: {
    dias: number;
    totais: MetricTotals;
    destaque: {
      id: number;
      titulo: string;
      plataforma: Platform | null;
      formato: ContentFormat | null;
      dataPublicacao: string | null;
      visualizacoes: number;
      taxaEngajamento: number | null;
    } | null;
  };
}

/* ==========================================================================
   BILLING (planos e checkout)
   ========================================================================== */
export type PaidPlan = Exclude<Plan, "FREE">;

/** Limites do plano; null = ilimitado */
export interface PlanLimits {
  ideias: number | null;
  conteudosAtivos: number | null;
  armazenamentoMB: number | null;
  historicoMetricasDias: number | null;
  membros: number | null;
}

export interface PlanOffer {
  plano: Plan;
  nome: string;
  descricao: string;
  precoCentavos: number;
  moeda: "brl";
  limites: PlanLimits;
}

export interface BillingPlansResponse {
  planos: PlanOffer[];
  stripeConfigurado: boolean;
  /** Fora de produção: permite ativar planos sem cartão */
  modoTeste: boolean;
}

export interface CheckoutResponse {
  /** Stripe Checkout, portal do cliente ou retorno simulado */
  url?: string;
  mockActivated?: boolean;
  /** Troca Creator <-> Studio feita direto na assinatura */
  changed?: boolean;
  user?: User;
  message?: string;
}

export type PlanResource = keyof PlanLimits;

/** GET /user/usage — uso do workspace atual frente aos limites do plano do dono */
export interface UsageResponse {
  plano: Plan;
  limites: PlanLimits;
  uso: { ideias: number; conteudosAtivos: number; armazenamentoBytes: number; membros: number };
  workspace: { id: string; nome: string; pessoal: boolean; souDono: boolean; nomeDono: string };
}
