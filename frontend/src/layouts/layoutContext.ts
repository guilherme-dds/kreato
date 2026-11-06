import { useOutletContext } from "react-router-dom";
import type { PlanResource } from "../types";

export type ShowToast = (type: "success" | "error" | "info", text: string) => void;

export interface LayoutContext {
  showToast: ShowToast;
  /** Abre a página de planos; com o recurso, explica qual limite foi atingido */
  openPlans: (reason?: PlanResource) => void;
}

/** Acesso, nas páginas internas, às ações expostas pelo AppLayout */
export function useLayoutContext(): LayoutContext {
  return useOutletContext<LayoutContext>();
}
