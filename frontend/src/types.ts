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
}

export interface ContentDetail extends Content {
  roteiro: string | null;
  legenda: string | null;
  ideia: { id: number; titulo: string } | null;
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
}

