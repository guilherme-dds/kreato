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
