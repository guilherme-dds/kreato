import { useOutletContext } from "react-router-dom";
import type { PlanResource, WorkspaceSummary } from "../types";

export type ShowToast = (type: "success" | "error" | "info", text: string) => void;

export interface LayoutContext {
  showToast: ShowToast;
  /** Abre a página de planos; com o recurso, explica qual limite foi atingido */
  openPlans: (reason?: PlanResource) => void;
  /** Workspace em uso (null enquanto a lista carrega) */
  workspace: WorkspaceSummary | null;
  /** Recarrega a lista de workspaces (ex.: depois de renomear ou mudar a equipe) */
  refreshWorkspaces: () => Promise<void>;
  /** Troca o workspace ativo; as páginas recarregam com os dados dele */
  switchWorkspace: (workspace: WorkspaceSummary) => void;
}

/** Acesso, nas páginas internas, às ações expostas pelo AppLayout */
export function useLayoutContext(): LayoutContext {
  return useOutletContext<LayoutContext>();
}
