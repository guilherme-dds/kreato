import type { Request, Response } from "express";
import type Stripe from "stripe";
import prisma from "../utils/prisma.js";
import { logEvent } from "../utils/logger.js";
import { PLANS, isPaidPlan, normalizePlan, type Plan } from "../utils/plans.js";
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  PLAN_PRICING,
  checkoutLineItem,
  getStripe,
  getWebhookSecret,
  isLiveMode,
  isMockStripeId,
  listPlanOffers,
  parsePaidPlan,
  planFromSubscription,
  priceIdFor,
  type PaidPlan,
} from "../utils/billing.js";

const userSelect = {
  id: true,
  nome: true,
  email: true,
  role: true,
  plano: true,
  bio: true,
  fotoPerfil: true,
  criadoEm: true,
} as const;

export function getFrontendUrl(req: Request): string {
  const origin = req.headers.origin || req.headers.referer;
  if (origin && typeof origin === "string") {
    try {
      const url = new URL(origin);
      return `${url.protocol}//${url.host}`.replace(/\/+$/, "");
    } catch {}
  }
  return (process.env.FRONTEND_URL || "http://localhost:8209").replace(/\/+$/, "");
}

const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id ?? null;

/** Plano pago só sobrevive enquanto a assinatura estiver ativa */
function planForSubscriptionStatus(subscription: Stripe.Subscription): Plan {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status) ? planFromSubscription(subscription) : "FREE";
}

export class StripeController {
  /**
   * GET /stripe/plans — catálogo público: preço (do Price no Stripe, quando configurado) e limites de cada plano
   */
  async plans(_req: Request, res: Response) {
    try {
      const stripe = getStripe();
      return res.json({
        planos: await listPlanOffers(),
        stripeConfigurado: !!stripe,
        // Ativação sem cartão só existe fora de produção
        modoTeste: !isLiveMode(),
      });
    } catch (error: any) {
      console.error("Erro ao listar planos:", error);
      return res.status(500).json({ error: "Erro ao carregar os planos." });
    }
  }

  /**
   * POST /stripe/create-checkout-session — corpo { plano: "CREATOR" | "STUDIO" } (padrão CREATOR)
   * - Gratuito: abre o Stripe Checkout do plano escolhido
   * - Já assinante do mesmo plano: portal do cliente
   * - Já assinante de outro plano: troca o preço da assinatura (com proporcional)
   */
  async createCheckoutSession(req: Request, res: Response) {
    const { userId } = req;
    const requested = req.body?.plano;
    const plan: PaidPlan | null = requested === undefined ? "CREATOR" : parsePaidPlan(requested);
    if (!plan) {
      return res.status(400).json({ error: "Plano inválido. Use CREATOR ou STUDIO." });
    }

    try {
      const user = await prisma.usuario.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

      const stripe = getStripe();
      const frontendUrl = getFrontendUrl(req);
      const currentPlan = normalizePlan(user.plano);

      if (isPaidPlan(currentPlan)) {
        if (currentPlan !== plan) return this.changePlan(req, res, user, plan, stripe, frontendUrl);

        if (stripe && !isMockStripeId(user.stripeCustomerId)) {
          try {
            const portalSession = await stripe.billingPortal.sessions.create({
              customer: user.stripeCustomerId as string,
              return_url: frontendUrl,
            });
            return res.json({ url: portalSession.url });
          } catch (portalErr: any) {
            console.warn("Erro ao criar sessão do portal do Stripe:", portalErr.message);
          }
        }
        return res.json({
          url: `${frontendUrl}/?stripe_status=manage_mock`,
          message: "Você já possui este plano ativo!",
        });
      }

      if (!stripe) {
        // Sem chave do Stripe (desenvolvimento): o retorno simulado ativa o plano em /verify-session
        return res.json({
          url: `${frontendUrl}/?stripe_status=success_mock&plano=${plan}`,
          mockActivated: true,
          message: "Modo Teste Stripe (sem chave informada): redirecionando para ativação simulada...",
        });
      }

      let customerId = isMockStripeId(user.stripeCustomerId) ? null : user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.nome,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await prisma.usuario.update({ where: { id: userId }, data: { stripeCustomerId: customerId } });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        client_reference_id: userId,
        metadata: { userId, plano: plan },
        // A assinatura carrega o plano para os webhooks de atualização/cancelamento
        subscription_data: { metadata: { userId, plano: plan } },
        line_items: [checkoutLineItem(plan)],
        success_url: `${frontendUrl}/?stripe_status=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/?stripe_status=cancel`,
      });

      await logEvent({ userId, acao: "CHECKOUT_STARTED", req, entidade: "assinatura", detalhes: { plano: plan } });

      return res.json({ url: session.url, id: session.id });
    } catch (error: any) {
      console.error("Erro ao criar sessão do Stripe Checkout:", error);
      return res.status(500).json({ error: "Erro ao processar pagamento com Stripe." });
    }
  }

  /**
   * Troca Creator <-> Studio de quem já assina.
   * Assinatura real: atualiza o preço do item no Stripe (proporcional) e o plano local.
   * Sem Price ID do plano de destino: manda para o portal do cliente.
   */
  private async changePlan(
    req: Request,
    res: Response,
    user: { id: string; plano: string; stripeCustomerId: string | null; stripeSubscriptionId: string | null },
    plan: PaidPlan,
    stripe: Stripe | null,
    frontendUrl: string
  ) {
    const fromPlan = normalizePlan(user.plano);
    const hasRealSubscription = !!stripe && !isMockStripeId(user.stripeSubscriptionId);

    if (hasRealSubscription) {
      const priceId = priceIdFor(plan);
      if (!priceId) {
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: user.stripeCustomerId as string,
          return_url: frontendUrl,
        });
        return res.json({
          url: portalSession.url,
          message: `Configure ${PLAN_PRICING[plan].priceEnv} para trocar de plano direto pelo Kreato.`,
        });
      }

      const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId as string);
      const item = subscription.items.data[0];
      if (!item) return res.status(409).json({ error: "Assinatura sem itens no Stripe." });

      await stripe.subscriptions.update(subscription.id, {
        items: [{ id: item.id, price: priceId }],
        proration_behavior: "create_prorations",
        metadata: { ...subscription.metadata, plano: plan },
      });
    } else if (stripe && isLiveMode()) {
      // Em produção, plano pago sem assinatura real não pode ser trocado sem pagamento
      return res.status(409).json({ error: "Assinatura não encontrada no Stripe. Assine o plano pelo checkout." });
    }

    const updatedUser = await prisma.usuario.update({
      where: { id: user.id },
      data: { plano: plan },
      select: userSelect,
    });

    await logEvent({
      userId: user.id,
      acao: "PLAN_CHANGED",
      req,
      entidade: "assinatura",
      detalhes: { de: fromPlan, para: plan, simulado: !hasRealSubscription },
    });

    return res.json({
      changed: true,
      user: updatedUser,
      message: `Plano alterado para ${PLAN_PRICING[plan].nome}.`,
    });
  }

  /**
   * POST /stripe/verify-session — corpo { sessionId } (ou { plano } no modo sem chave do Stripe).
   * Com Stripe configurado, só ativa o plano de uma sessão concluída que pertença ao próprio usuário.
   */
  async verifySession(req: Request, res: Response) {
    const { userId } = req;
    const { sessionId, plano } = req.body || {};

    try {
      const stripe = getStripe();
      const dataToUpdate: { plano: PaidPlan; stripeCustomerId?: string; stripeSubscriptionId?: string } = {
        plano: "CREATOR",
      };

      if (stripe) {
        if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
          return res.status(400).json({ error: "Sessão de pagamento não informada." });
        }

        let session: Stripe.Checkout.Session;
        try {
          session = await stripe.checkout.sessions.retrieve(sessionId.trim());
        } catch {
          return res.status(400).json({ error: "Sessão de pagamento inválida." });
        }

        const owner = session.client_reference_id || session.metadata?.userId;
        if (owner !== userId) {
          await logEvent({ userId, acao: "VERIFY_STRIPE_SESSION_REJECTED", req, entidade: "assinatura" });
          return res.status(403).json({ error: "Esta sessão de pagamento não pertence à sua conta." });
        }
        if (session.status !== "complete" || (session.payment_status !== "paid" && session.payment_status !== "no_payment_required")) {
          return res.status(402).json({ error: "O pagamento ainda não foi confirmado pelo Stripe." });
        }

        dataToUpdate.plano = parsePaidPlan(session.metadata?.plano) ?? "CREATOR";
        const customerId = idOf(session.customer);
        const subscriptionId = idOf(session.subscription);
        if (customerId) dataToUpdate.stripeCustomerId = customerId;
        if (subscriptionId) dataToUpdate.stripeSubscriptionId = subscriptionId;
      } else {
        // Sem chave do Stripe: ambiente de desenvolvimento, ativação simulada
        dataToUpdate.plano = parsePaidPlan(plano) ?? "CREATOR";
      }

      const updatedUser = await prisma.usuario.update({
        where: { id: userId },
        data: dataToUpdate,
        select: userSelect,
      });

      await logEvent({
        userId,
        acao: "VERIFY_STRIPE_PAYMENT_SUCCESS",
        req,
        entidade: "assinatura",
        detalhes: { plano: dataToUpdate.plano, simulado: !stripe },
      });

      return res.json({ user: updatedUser, success: true });
    } catch (error: any) {
      console.error("Erro ao verificar sessão do Stripe:", error);
      return res.status(500).json({ error: "Erro ao confirmar pagamento do Stripe." });
    }
  }

  /**
   * POST /stripe/webhook — eventos assinados pelo Stripe (corpo bruto, ver server.ts).
   * Sem STRIPE_WEBHOOK_SECRET o endpoint recusa tudo: eventos sem assinatura poderiam ativar planos.
   */
  async webhook(req: Request, res: Response) {
    const stripe = getStripe();
    const webhookSecret = getWebhookSecret();
    if (!stripe || !webhookSecret) {
      return res.status(503).json({ error: "Webhook do Stripe não configurado." });
    }

    let event: Stripe.Event;
    try {
      const signature = req.headers["stripe-signature"];
      if (typeof signature !== "string" || !Buffer.isBuffer(req.body)) throw new Error("Assinatura ausente.");
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch (error: any) {
      console.warn("[Stripe Webhook] Assinatura inválida:", error.message);
      return res.status(400).send(`Webhook Error: ${error.message}`);
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const userId = session.client_reference_id || session.metadata?.userId;
          if (!userId || session.mode !== "subscription") break;

          const plan = parsePaidPlan(session.metadata?.plano) ?? "CREATOR";
          const customerId = idOf(session.customer);
          const subscriptionId = idOf(session.subscription);

          await prisma.usuario.updateMany({
            where: { id: userId },
            data: {
              plano: plan,
              ...(customerId ? { stripeCustomerId: customerId } : {}),
              ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
            },
          });
          console.log(`[Stripe Webhook] Usuário ${userId} atualizado para o plano ${plan}.`);
          break;
        }

        // Troca de plano pelo portal, falha de cobrança, reativação...
        case "customer.subscription.updated": {
          const subscription = event.data.object;
          const customerId = idOf(subscription.customer);
          if (!customerId) break;

          const plan = planForSubscriptionStatus(subscription);
          await prisma.usuario.updateMany({
            where: { stripeCustomerId: customerId },
            data: { plano: plan, stripeSubscriptionId: plan === "FREE" ? null : subscription.id },
          });
          console.log(`[Stripe Webhook] Assinatura ${subscription.id} (${subscription.status}) -> ${plan}.`);
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object;
          const customerId = idOf(subscription.customer);
          if (!customerId) break;

          // Só rebaixa se for a assinatura vigente do usuário (evita corrida com uma assinatura nova)
          await prisma.usuario.updateMany({
            where: {
              stripeCustomerId: customerId,
              OR: [{ stripeSubscriptionId: subscription.id }, { stripeSubscriptionId: null }],
            },
            data: { plano: "FREE", stripeSubscriptionId: null },
          });
          console.log(`[Stripe Webhook] Assinatura cancelada para customer ${customerId}.`);
          break;
        }

        default:
          console.log(`[Stripe Webhook] Evento não tratado: ${event.type}`);
      }

      return res.status(200).json({ received: true });
    } catch (error: any) {
      console.error("Erro ao processar webhook do Stripe:", error.message);
      // 500 faz o Stripe reenviar o evento depois
      return res.status(500).json({ error: "Erro ao processar evento." });
    }
  }

  /**
   * POST /stripe/mock-upgrade — corpo { plano? } — ativa um plano sem cartão (somente fora de produção).
   * Sem plano informado, alterna entre FREE e CREATOR.
   */
  async mockUpgrade(req: Request, res: Response) {
    const { userId } = req;
    if (isLiveMode()) {
      return res.status(403).json({ error: "Ativação de teste indisponível em produção." });
    }

    const requested = req.body?.plano;
    if (requested !== undefined && !(PLANS as readonly string[]).includes(String(requested).toUpperCase())) {
      return res.status(400).json({ error: "Plano inválido. Use FREE, CREATOR ou STUDIO." });
    }

    try {
      const user = await prisma.usuario.findUnique({ where: { id: userId }, select: { plano: true } });
      const nextPlan: Plan =
        requested !== undefined ? normalizePlan(requested) : isPaidPlan(user?.plano) ? "FREE" : "CREATOR";
      const paid = isPaidPlan(nextPlan);

      const updatedUser = await prisma.usuario.update({
        where: { id: userId },
        data: {
          plano: nextPlan,
          stripeCustomerId: paid ? `cus_test_mock_${Date.now()}` : null,
          stripeSubscriptionId: paid ? `sub_test_mock_${Date.now()}` : null,
        },
        select: userSelect,
      });

      await logEvent({
        userId,
        acao: paid ? "MOCK_UPGRADE_PLAN" : "MOCK_CANCEL_PLAN",
        req,
        entidade: "assinatura",
        detalhes: { plano: nextPlan },
      });

      const paidPlan = parsePaidPlan(nextPlan);
      return res.json({
        user: updatedUser,
        message: paidPlan
          ? `Parabéns! Você agora é assinante do ${PLAN_PRICING[paidPlan].nome} em modo de teste!`
          : "Plano pago desativado com sucesso.",
      });
    } catch (error: any) {
      console.error("Erro ao alternar plano:", error);
      return res.status(500).json({ error: "Erro ao atualizar status do plano." });
    }
  }

  /**
   * POST /stripe/cancel — cancela a assinatura e volta ao plano gratuito
   */
  async cancelSubscription(req: Request, res: Response) {
    const { userId } = req;

    try {
      const user = await prisma.usuario.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

      const stripe = getStripe();
      if (stripe && !isMockStripeId(user.stripeSubscriptionId)) {
        try {
          await stripe.subscriptions.cancel(user.stripeSubscriptionId as string);
        } catch (err: any) {
          console.warn("Erro ao cancelar no Stripe API:", err.message);
          // Assinatura já inexistente/cancelada no Stripe: segue com o rebaixamento local.
          // Outras falhas: não rebaixa, senão o usuário perderia o plano e continuaria sendo cobrado.
          if (err?.code !== "resource_missing") return res.status(502).json({ error: "Não foi possível cancelar a assinatura no Stripe. Tente novamente." });
        }
      }

      const updatedUser = await prisma.usuario.update({
        where: { id: userId },
        data: { plano: "FREE", stripeSubscriptionId: null },
        select: userSelect,
      });

      await logEvent({
        userId,
        acao: "CANCEL_SUBSCRIPTION",
        req,
        entidade: "assinatura",
        detalhes: { planoAnterior: normalizePlan(user.plano) },
      });

      return res.json({ user: updatedUser, message: "Assinatura cancelada com sucesso." });
    } catch (error: any) {
      console.error("Erro ao cancelar assinatura:", error);
      return res.status(500).json({ error: "Erro ao cancelar assinatura." });
    }
  }
}
