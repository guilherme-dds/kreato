import { Prisma } from "../generated/prisma/client.js";
import prisma from "./prisma.js";

export const WORKSPACE_ROLES = ["DONO", "GESTOR", "ROTEIRISTA", "EDITOR"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export function normalizeWorkspaceRole(value: unknown): WorkspaceRole {
  const upper = typeof value === "string" ? value.toUpperCase() : "";
  return (WORKSPACE_ROLES as readonly string[]).includes(upper) ? (upper as WorkspaceRole) : "EDITOR";
}

export function canManageWorkspace(role: unknown): boolean {
  const normalized = normalizeWorkspaceRole(role);
  return normalized === "DONO" || normalized === "GESTOR";
}

const membershipInclude = {
  workspace: {
    select: {
      id: true,
      nome: true,
      donoId: true,
      pessoalDoUsuarioId: true,
      dono: { select: { plano: true } },
    },
  },
} satisfies Prisma.MembroWorkspaceInclude;

export type MembershipWithWorkspace = Prisma.MembroWorkspaceGetPayload<{ include: typeof membershipInclude }>;

/**
 * Vagas do plano: o dono ocupa a primeira e as demais seguem a ordem de entrada.
 * Depois de um downgrade, quem passou do limite perde o acesso até o dono liberar
 * vagas (removendo alguém) ou voltar a um plano maior; ninguém é apagado.
 */
export async function holdsSeat(membership: MembershipWithWorkspace, limit: number): Promise<boolean> {
  if (!Number.isFinite(limit) || membership.usuarioId === membership.workspace.donoId) return true;

  const ahead = await prisma.membroWorkspace.count({
    where: {
      workspaceId: membership.workspaceId,
      usuarioId: { not: membership.workspace.donoId },
      OR: [
        { criadoEm: { lt: membership.criadoEm } },
        { criadoEm: membership.criadoEm, id: { lt: membership.id } },
      ],
    },
  });

  return 1 + ahead < limit;
}

/** Ids dos membros que estão fora das vagas do plano (mesma ordem de holdsSeat) */
export function membersWithoutSeat(
  members: { id: number; criadoEm: Date; usuario: { id: string } }[],
  ownerId: string,
  limit: number,
): Set<number> {
  if (!Number.isFinite(limit)) return new Set();
  const others = members
    .filter((member) => member.usuario.id !== ownerId)
    .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime() || a.id - b.id);
  return new Set(others.slice(Math.max(0, limit - 1)).map((member) => member.id));
}

export function findMembership(workspaceId: string, userId: string): Promise<MembershipWithWorkspace | null> {
  return prisma.membroWorkspace.findUnique({
    where: { workspaceId_usuarioId: { workspaceId, usuarioId: userId } },
    include: membershipInclude,
  });
}

/**
 * Retorna a participação do usuário no seu workspace pessoal, criando-o na primeira vez.
 * Cobre usuários cadastrados antes da existência de workspaces e cadastros novos.
 */
export async function ensurePersonalWorkspace(userId: string): Promise<MembershipWithWorkspace> {
  let workspace = await prisma.workspace.findUnique({
    where: { pessoalDoUsuarioId: userId },
    select: { id: true },
  });

  if (!workspace) {
    const user = await prisma.usuario.findUniqueOrThrow({ where: { id: userId }, select: { nome: true } });
    const firstName = user.nome.trim().split(/\s+/)[0] || user.nome;

    try {
      workspace = await prisma.workspace.create({
        data: {
          nome: `Workspace de ${firstName}`,
          donoId: userId,
          pessoalDoUsuarioId: userId,
          membros: { create: { usuarioId: userId, papel: "DONO" } },
        },
        select: { id: true },
      });
    } catch (error) {
      // Outra requisição simultânea criou o workspace pessoal primeiro
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
        throw error;
      }
      workspace = await prisma.workspace.findUniqueOrThrow({
        where: { pessoalDoUsuarioId: userId },
        select: { id: true },
      });
    }
  }

  const membership = await findMembership(workspace.id, userId);
  if (membership) return membership;

  return prisma.membroWorkspace.create({
    data: { workspaceId: workspace.id, usuarioId: userId, papel: "DONO" },
    include: membershipInclude,
  });
}
