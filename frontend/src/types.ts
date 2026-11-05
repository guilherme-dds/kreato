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
