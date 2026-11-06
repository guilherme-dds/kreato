import { CONTENT_STAGES, type ContentStage } from "./content.js";
import { canManageWorkspace, type WorkspaceRole } from "./workspaces.js";

/**
 * Permissões do pipeline por papel e etapa (funções puras).
 * - DONO/GESTOR: tudo, inclusive aprovar roteiro, agendar e publicar.
 * - ROTEIRISTA: cria e edita textos em Ideia/Roteiro e move entre essas duas colunas.
 * - EDITOR: move entre Gravação e Edição (anexos e comentários valem para todos).
 * Sair de Roteiro para Gravação é a aprovação do roteiro: só DONO/GESTOR.
 */

const ROLE_LANES: Partial<Record<WorkspaceRole, readonly ContentStage[]>> = {
  ROTEIRISTA: ["IDEIA", "ROTEIRO"],
  EDITOR: ["GRAVACAO", "EDICAO"],
};

/** Campos de texto do conteúdo (o roteirista edita enquanto o roteiro não foi aprovado) */
export const TEXT_FIELDS = ["titulo", "roteiro", "legenda", "hashtags", "plataforma", "formato"] as const;
/** Campos de agenda/publicação: só DONO/GESTOR */
export const PUBLICATION_FIELDS = ["dataPublicacao", "urlPublicacao"] as const;

const SCRIPT_STAGES: readonly ContentStage[] = ["IDEIA", "ROTEIRO"];

export function isManager(role: WorkspaceRole): boolean {
  return canManageWorkspace(role);
}

export function canMoveContent(role: WorkspaceRole, from: ContentStage, to: ContentStage): boolean {
  if (isManager(role)) return true;
  const lane = ROLE_LANES[role] ?? [];
  return lane.includes(from) && lane.includes(to);
}

/** Etapas para onde o papel pode levar um conteúdo que está em `from` (inclui a própria, para reordenar) */
export function allowedTargets(role: WorkspaceRole, from: ContentStage): ContentStage[] {
  return CONTENT_STAGES.filter((to) => canMoveContent(role, from, to));
}

export function canCreateInStage(role: WorkspaceRole, stage: ContentStage): boolean {
  if (isManager(role)) return true;
  return role === "ROTEIRISTA" && SCRIPT_STAGES.includes(stage);
}

export function creatableStages(role: WorkspaceRole): ContentStage[] {
  return CONTENT_STAGES.filter((stage) => canCreateInStage(role, stage));
}

export function canEditText(role: WorkspaceRole, stage: ContentStage): boolean {
  if (isManager(role)) return true;
  return role === "ROTEIRISTA" && SCRIPT_STAGES.includes(stage);
}

export function canEditPublication(role: WorkspaceRole): boolean {
  return isManager(role);
}

/** Campos do PATCH que o papel não pode alterar nesta etapa (vazio = pode tudo) */
export function forbiddenFields(role: WorkspaceRole, stage: ContentStage, fields: string[]): string[] {
  return fields.filter((field) => {
    if ((PUBLICATION_FIELDS as readonly string[]).includes(field)) return !canEditPublication(role);
    return !canEditText(role, stage);
  });
}

export function canDeleteContent(role: WorkspaceRole, stage: ContentStage, isAuthor: boolean): boolean {
  if (isManager(role)) return true;
  return isAuthor && role === "ROTEIRISTA" && SCRIPT_STAGES.includes(stage);
}

/** Aprovar o roteiro (e pedir ajustes) é papel de quem gerencia o workspace */
export function canReviewScript(role: WorkspaceRole): boolean {
  return isManager(role);
}

/** Resumo enviado ao frontend para habilitar/desabilitar ações do conteúdo */
export function contentPermissions(role: WorkspaceRole, stage: ContentStage, isAuthor: boolean) {
  return {
    papel: role,
    editarTexto: canEditText(role, stage),
    editarPublicacao: canEditPublication(role),
    moverPara: allowedTargets(role, stage),
    aprovarRoteiro: canReviewScript(role) && stage === "ROTEIRO",
    solicitarAjustes: canReviewScript(role) && (stage === "ROTEIRO" || stage === "GRAVACAO"),
    excluir: canDeleteContent(role, stage, isAuthor),
    moderarComentarios: isManager(role),
  };
}

export type ContentPermissions = ReturnType<typeof contentPermissions>;
