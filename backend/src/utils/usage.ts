import prisma from "./prisma.js";
import { FINAL_STAGE } from "./content.js";

/** Contagens de uso que valem para os limites do plano (sempre por workspace) */

/** Ideias arquivadas não contam no limite */
export function countActiveIdeas(workspaceId: string) {
  return prisma.ideia.count({ where: { workspaceId, status: { not: "ARQUIVADA" } } });
}

/** Conteúdos publicados saem do pipeline ativo e não contam no limite */
export function countActiveContents(workspaceId: string) {
  return prisma.conteudo.count({ where: { workspaceId, etapa: { not: FINAL_STAGE } } });
}

export async function countStorageBytes(workspaceId: string) {
  const result = await prisma.anexo.aggregate({ where: { workspaceId }, _sum: { tamanhoBytes: true } });
  return result._sum.tamanhoBytes ?? 0;
}

export function countMembers(workspaceId: string) {
  return prisma.membroWorkspace.count({ where: { workspaceId } });
}
