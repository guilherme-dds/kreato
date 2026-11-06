import { useCallback, useEffect, useState } from "react";
import {
  activateMockPlanApi,
  cancelStripeSubscriptionApi,
  createStripeCheckoutSessionApi,
  getBillingPlansApi,
} from "../../api/backend";
import { useAuth } from "../../context/AuthContext";
import type { BillingPlansResponse, PaidPlan, Plan } from "../../types";
import { PLAN_LABELS, getUserPlan } from "../../utils/plans";

type ShowToast = (type: "success" | "error" | "info", text: string) => void;

/** Ação em andamento: qual plano e qual botão (para mostrar o carregando no lugar certo) */
export type PendingAction = { kind: "checkout" | "mock"; plan: Plan } | { kind: "cancel" } | null;

/**
 * Catálogo de planos + ações de assinatura (checkout, troca de plano, ativação de teste, cancelamento).
 * Usado pelo modal de planos e, depois, pela página de planos.
 */
export function usePlanActions(showToast: ShowToast, onDone?: () => void) {
  const { token, user, updateUser } = useAuth();
  const [catalog, setCatalog] = useState<BillingPlansResponse | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);

  const currentPlan = getUserPlan(user);

  const loadCatalog = useCallback(async () => {
    setCatalogError(null);
    try {
      setCatalog(await getBillingPlansApi(token));
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : "Erro ao carregar os planos");
    }
  }, [token]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const subscribe = async (plan: PaidPlan) => {
    // Troca para um plano menor: o Stripe credita a diferença proporcional, mas recursos da equipe somem
    if (currentPlan === "STUDIO" && plan === "CREATOR") {
      const ok = window.confirm(
        "Mudar para o Kreato Creator? O workspace volta a ter só você como membro e o armazenamento cai para 2 GB."
      );
      if (!ok) return;
    }

    setPending({ kind: "checkout", plan });
    try {
      const data = await createStripeCheckoutSessionApi(plan, token);
      if (data.changed && data.user) {
        updateUser(data.user);
        showToast("success", data.message ?? `Plano alterado para ${PLAN_LABELS[plan]}.`);
        onDone?.();
      } else if (data.url) {
        showToast("info", data.message ?? "Redirecionando para o Stripe...");
        window.location.href = data.url;
        return; // mantém o botão em "carregando" até sair da página
      }
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao conectar com o Stripe.");
    }
    setPending(null);
  };

  const activateMock = async (plan: Plan) => {
    setPending({ kind: "mock", plan });
    try {
      const data = await activateMockPlanApi(plan, token);
      updateUser(data.user);
      showToast("success", data.message);
      onDone?.();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao ativar o plano de teste.");
    } finally {
      setPending(null);
    }
  };

  const cancel = async () => {
    const ok = window.confirm(
      `Cancelar o ${PLAN_LABELS[currentPlan]}? Você volta ao plano Gratuito e os limites passam a valer imediatamente.`
    );
    if (!ok) return;

    setPending({ kind: "cancel" });
    try {
      const data = await cancelStripeSubscriptionApi(token);
      updateUser(data.user);
      showToast("info", "Assinatura cancelada. Você voltou ao plano Gratuito.");
      onDone?.();
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Erro ao cancelar assinatura.");
    } finally {
      setPending(null);
    }
  };

  return { catalog, catalogError, loadCatalog, currentPlan, pending, subscribe, activateMock, cancel };
}
