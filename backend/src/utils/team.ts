import { createHash, randomBytes } from "node:crypto";
import type { WorkspaceRole } from "./workspaces.js";

/** Regras de equipe (funções puras): quem pode convidar, promover e remover quem */

/** Papéis que podem ser atribuídos por convite ou alteração (DONO é único e fixo) */
export const ASSIGNABLE_ROLES = ["GESTOR", "ROTEIRISTA", "EDITOR"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const INVITE_TTL_DAYS = 7;
/** Proteção contra spam de e-mails: convites criados/reenviados por workspace a cada 24h */
export const MAX_INVITES_PER_DAY = 20;

export function parseAssignableRole(value: unknown): AssignableRole | null {
  const upper = typeof value === "string" ? value.trim().toUpperCase() : "";
  return (ASSIGNABLE_ROLES as readonly string[]).includes(upper) ? (upper as AssignableRole) : null;
}

/**
 * Quem pode atribuir um papel (ao convidar ou alterar um membro):
 * o DONO atribui qualquer papel; o GESTOR atribui ROTEIRISTA e EDITOR (não cria outros gestores).
 */
export function canAssignRole(actor: WorkspaceRole, role: AssignableRole): boolean {
  if (actor === "DONO") return true;
  if (actor === "GESTOR") return role !== "GESTOR";
  return false;
}

/**
 * Quem pode alterar ou remover um membro que hoje tem o papel `target`:
 * ninguém mexe no DONO; o GESTOR só gerencia ROTEIRISTA e EDITOR.
 */
export function canManageMember(actor: WorkspaceRole, target: WorkspaceRole): boolean {
  if (target === "DONO") return false;
  if (actor === "DONO") return true;
  if (actor === "GESTOR") return target === "ROTEIRISTA" || target === "EDITOR";
  return false;
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 150 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Token do link: 32 bytes aleatórios (base64url) */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type InviteState = "PENDENTE" | "EXPIRADO" | "ACEITO" | "REVOGADO";

export function inviteState(invite: { status: string; expiraEm: Date }, now = new Date()): InviteState {
  if (invite.status === "ACEITO" || invite.status === "REVOGADO") return invite.status;
  return invite.expiraEm.getTime() <= now.getTime() ? "EXPIRADO" : "PENDENTE";
}

export function inviteExpiry(now = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000);
}

/** Vagas ocupadas: membros + convites ainda válidos (reservam a vaga até expirar ou ser revogado) */
export function hasFreeSeat(members: number, pendingInvites: number, limit: number): boolean {
  return members + pendingInvites < limit;
}
