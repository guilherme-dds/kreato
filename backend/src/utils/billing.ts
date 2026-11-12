import Stripe from "stripe";
import { PLANS, normalizePlan, serializePlanLimits, type Plan } from "./plans.js";

/** Planos vendidos via Stripe (o FREE não tem assinatura) */
export const PAID_PLANS = ["CREATOR", "STUDIO"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];

interface PlanPricing {
  nome: string;
  descricao: string;
  /** Preço usado quando não há Price ID configurado (centavos de BRL, cobrança mensal) */
  centavosPadrao: number;
  priceEnv: string;
}

// Faixas do Lean Canvas: Creator R$29–39, Studio R$79–129. Os valores reais vêm do Price ID, quando configurado.
export const PLAN_PRICING: Record<PaidPlan, PlanPricing> = {
  CREATOR: {
    nome: "Kreato Creator",
    descricao: "Ideias e conteúdos ilimitados, histórico completo de métricas e 2 GB para anexos.",
    centavosPadrao: 2990,
    priceEnv: "STRIPE_PRICE_CREATOR",
  },
  STUDIO: {
    nome: "Kreato Studio",
    descricao: "Tudo do Creator, equipe com até 5 membros, papéis por etapa e 10 GB para anexos.",
    centavosPadrao: 7990,
    priceEnv: "STRIPE_PRICE_STUDIO",
  },
};

/**
 * Status de assinatura que liberam o plano pago. past_due (cobrança da renovação falhou) e unpaid
 * ficam de fora: o plano pago não continua de graça enquanto o Stripe tenta cobrar de novo.
 */
export const ACTIVE_SUBSCRIPTION_STATUSES: ReadonlySet<Stripe.Subscription.Status> = new Set(["active", "trialing"]);

export function parsePaidPlan(value: unknown): PaidPlan | null {
  const upper = typeof value === "string" ? value.trim().toUpperCase() : "";
  return (PAID_PLANS as readonly string[]).includes(upper) ? (upper as PaidPlan) : null;
}

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && !value.includes("YOUR_STRIPE") && !value.endsWith("...") ? value : null;
}

export function getStripe(): Stripe | null {
  const secretKey = readEnv("STRIPE_SECRET_KEY");
  if (!secretKey) return null;

  // Testes locais com um Stripe simulado (ex.: stripe-mock). Ignorado com chave live.
  const apiBase = readEnv("STRIPE_API_BASE");
  if (apiBase && !/^(sk|rk)_live_/.test(secretKey)) {
    const url = new URL(apiBase);
    return new Stripe(secretKey, {
      host: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      protocol: url.protocol === "https:" ? "https" : "http",
    });
  }
  return new Stripe(secretKey);
}

/** Chave live: desativa atalhos de teste (ativação sem cartão) */
export function isLiveMode(): boolean {
  const secretKey = readEnv("STRIPE_SECRET_KEY");
  return !!secretKey && /^(sk|rk)_live_/.test(secretKey);
}

export function getWebhookSecret(): string | null {
  return readEnv("STRIPE_WEBHOOK_SECRET");
}

/** IDs criados pelo modo de teste sem cartão (não existem no Stripe) */
export function isMockStripeId(id: string | null | undefined): boolean {
  return !id || id.startsWith("cus_test_mock_") || id.startsWith("sub_test_mock_");
}

/** Price ID do plano; o Creator aceita o antigo STRIPE_PRICE_ID por compatibilidade */
export function priceIdFor(plan: PaidPlan): string | null {
  return readEnv(PLAN_PRICING[plan].priceEnv) ?? (plan === "CREATOR" ? readEnv("STRIPE_PRICE_ID") : null);
}

export function planFromPriceId(priceId: string | null | undefined): PaidPlan | null {
  if (!priceId) return null;
  return PAID_PLANS.find((plan) => priceIdFor(plan) === priceId) ?? null;
}

/**
 * Descobre o plano de uma assinatura: primeiro o Price ID do item (muda quando o cliente troca de
 * plano pelo portal), depois a metadata gravada no checkout (preço criado sem Price ID).
 */
export function planFromSubscription(subscription: Stripe.Subscription): PaidPlan {
  return (
    subscription.items.data.map((item) => planFromPriceId(item.price.id)).find((plan) => plan !== null) ??
    parsePaidPlan(subscription.metadata?.plano) ??
    "CREATOR"
  );
}

/** Valor mensal da assinatura em centavos (planos anuais/semanais convertidos para mês) */
export function monthlyAmountCents(subscription: Stripe.Subscription): number {
  let total = 0;
  for (const item of subscription.items.data) {
    const unit = item.price.unit_amount ?? 0;
    const quantity = item.quantity ?? 1;
    const recurring = item.price.recurring;
    const every = recurring?.interval_count || 1;
    const perMonth: Record<string, number> = { day: 365 / 12, week: 52 / 12, month: 1, year: 1 / 12 };
    const factor = recurring ? (perMonth[recurring.interval] ?? 1) / every : 1;
    total += unit * quantity * factor;
  }
  return Math.round(total);
}

/** O que o banco guarda de uma assinatura (cópia do estado verdadeiro, que é o do Stripe) */
export interface SubscriptionSnapshot {
  plano: Plan;
  status: Stripe.Subscription.Status;
  /** Assinatura ainda existe (pode voltar a liberar o plano); canceled/incomplete_expired = terminou */
  vigente: boolean;
  valorMensalCentavos: number | null;
}

export function subscriptionSnapshot(subscription: Stripe.Subscription): SubscriptionSnapshot {
  const active = ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status);
  const ended = subscription.status === "canceled" || subscription.status === "incomplete_expired";
  return {
    plano: active ? planFromSubscription(subscription) : "FREE",
    status: subscription.status,
    vigente: !ended,
    valorMensalCentavos: ended ? null : monthlyAmountCents(subscription),
  };
}

export function checkoutLineItem(plan: PaidPlan): Stripe.Checkout.SessionCreateParams.LineItem {
  const priceId = priceIdFor(plan);
  if (priceId) return { price: priceId, quantity: 1 };

  const pricing = PLAN_PRICING[plan];
  return {
    price_data: {
      currency: "brl",
      product_data: { name: pricing.nome, description: pricing.descricao },
      unit_amount: pricing.centavosPadrao,
      recurring: { interval: "month" },
    },
    quantity: 1,
  };
}

/* --------------------------------------------------------------------------
   Catálogo de planos exibido no frontend
   -------------------------------------------------------------------------- */
const PRICE_CACHE_MS = 10 * 60_000;
const priceCache = new Map<string, { centavos: number | null; expiresAt: number }>();

/** Valor real do Price no Stripe (com cache), para a tela mostrar o que será cobrado */
async function resolvePriceCents(stripe: Stripe | null, plan: PaidPlan): Promise<number> {
  const fallback = PLAN_PRICING[plan].centavosPadrao;
  const priceId = priceIdFor(plan);
  if (!stripe || !priceId) return fallback;

  const cached = priceCache.get(priceId);
  if (cached && cached.expiresAt > Date.now()) return cached.centavos ?? fallback;

  try {
    const price = await stripe.prices.retrieve(priceId);
    priceCache.set(priceId, { centavos: price.unit_amount, expiresAt: Date.now() + PRICE_CACHE_MS });
    return price.unit_amount ?? fallback;
  } catch (error: any) {
    console.warn(`[Stripe] Não foi possível consultar o preço ${priceId}:`, error.message);
    priceCache.set(priceId, { centavos: null, expiresAt: Date.now() + PRICE_CACHE_MS });
    return fallback;
  }
}

export interface PlanOffer {
  plano: Plan;
  nome: string;
  descricao: string;
  precoCentavos: number;
  moeda: "brl";
  limites: ReturnType<typeof serializePlanLimits>;
}

export async function listPlanOffers(): Promise<PlanOffer[]> {
  const stripe = getStripe();
  return Promise.all(
    PLANS.map(async (plan) => {
      const paid = parsePaidPlan(plan);
      return {
        plano: normalizePlan(plan),
        nome: paid ? PLAN_PRICING[paid].nome : "Gratuito",
        descricao: paid
          ? PLAN_PRICING[paid].descricao
          : "Para começar: organize ideias, produza e acompanhe os últimos 30 dias.",
        precoCentavos: paid ? await resolvePriceCents(stripe, paid) : 0,
        moeda: "brl" as const,
        limites: serializePlanLimits(plan),
      };
    })
  );
}
