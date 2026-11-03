import { useOutletContext } from "react-router-dom";

export type ShowToast = (type: "success" | "error" | "info", text: string) => void;

export interface LayoutContext {
  showToast: ShowToast;
  openPlansModal: () => void;
}

/** Acesso, nas páginas internas, às ações expostas pelo AppLayout */
export function useLayoutContext(): LayoutContext {
  return useOutletContext<LayoutContext>();
}
