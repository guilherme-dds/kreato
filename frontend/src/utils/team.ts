import type { AssignableRole, WorkspaceRole } from "../types";

/** Mesmas regras de backend/src/utils/team.ts, usadas só para esconder ações que o servidor recusaria */

export const ASSIGNABLE_ROLES: AssignableRole[] = ["GESTOR", "ROTEIRISTA", "EDITOR"];

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  DONO: "Dono",
  GESTOR: "Gestor",
  ROTEIRISTA: "Roteirista",
  EDITOR: "Editor",
};

export const ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  DONO: "Assina o plano e tem acesso total, inclusive para convidar gestores.",
  GESTOR: "Aprova roteiros, agenda, publica e gerencia roteiristas e editores.",
  ROTEIRISTA: "Cria ideias e escreve roteiros até a aprovação.",
  EDITOR: "Cuida da gravação e da edição, com anexos e comentários.",
};

export function isManagerRole(role: WorkspaceRole | null | undefined): boolean {
  return role === "DONO" || role === "GESTOR";
}

/** O DONO atribui qualquer papel; o GESTOR atribui ROTEIRISTA e EDITOR */
export function canAssignRole(actor: WorkspaceRole, role: AssignableRole): boolean {
  if (actor === "DONO") return true;
  if (actor === "GESTOR") return role !== "GESTOR";
  return false;
}

/** Ninguém mexe no DONO; o GESTOR só gerencia ROTEIRISTA e EDITOR */
export function canManageMember(actor: WorkspaceRole, target: WorkspaceRole): boolean {
  if (target === "DONO") return false;
  if (actor === "DONO") return true;
  if (actor === "GESTOR") return target === "ROTEIRISTA" || target === "EDITOR";
  return false;
}

export function assignableRolesFor(actor: WorkspaceRole): AssignableRole[] {
  return ASSIGNABLE_ROLES.filter((role) => canAssignRole(actor, role));
}
