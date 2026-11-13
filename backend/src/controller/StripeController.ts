import type { Request, Response } from "express";
import type Stripe from "stripe";
import type { Prisma } from "../generated/prisma/client.js";
import prisma from "../utils/prisma.js";
import { logEvent } from "../utils/logger.js";
import { escapeHtml, sendEmail } from "../utils/mailer.js";
import { PLANS, isPaidPlan, normalizePlan, type Plan } from "../utils/plans.js";
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  PLAN_PRICING,
  checkoutLineItem,
  getStripe,
  getWebhookSecret,
  isMockStripeId,
  listPlanOffers,
  parsePaidPlan,
  priceIdFor,
  subscriptionSnapshot,
  type PaidPlan,
  type SubscriptionSnapshot,
} from "../utils/billing.js";

const userSelect = {
  id: true,
  nome: true,
  email: true,
  role: true,
  plano: true,
  statusAssinatura: true,
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

/** Mudança no usuário decidida por um evento do Stripe (aplicada junto com o registro do evento) */
interface WebhookChange {
  where: Prisma.UsuarioWhereInput;
  data: Prisma.UsuarioUpdateManyMutationInput;
  plano: Plan;
  status: string;
  /** Avisa o usuário depois de aplicar (ex.: cobrança recusada) */
  notifyPaymentFailed?: boolean;
}

/** Nome do evento de auditoria de cada webhook (aparece no painel admin) */
const WEBHOOK_ACTIONS: Record<string, string> = {
  "checkout.session.completed": "STRIPE_CHECKOUT_COMPLETED",
  "customer.subscription.updated": "STRIPE_SUBSCRIPTION_UPDATED",
  "customer.subscription.deleted": "STRIPE_SUBSCRIPTION_DELETED",
  "invoice.payment_failed": "STRIPE_PAYMENT_FAILED",
};

/**
 * Como o estado de uma assinatura vai para o usuário dono do customer.
 * - Ativa: vira a assinatura vigente do usuário (libera o plano pago).
 * - Inadimplente/incompleta: só mexe se for a assinatura vigente; o plano pago fica suspenso.
 * - Terminada: só rebaixa se for a vigente (uma assinatura antiga cancelada não derruba uma nova).
 */
function subscriptionChange(customerId: string, subscriptionId: string, snapshot: SubscriptionSnapshot): WebhookChange {
  const isCurrent: Prisma.UsuarioWhereInput = {
    stripeCustomerId: customerId,
    OR: [{ stripeSubscriptionId: subscriptionId }, { stripeSubscriptionId: null }],
  };
  const active = ACTIVE_SUBSCRIPTION_STATUSES.has(snapshot.status);
  return {
    where: active ? { stripeCustomerId: customerId } : isCurrent,
    data: {
      plano: snapshot.plano,
      statusAssinatura: snapshot.status,
      valorMensalCentavos: snapshot.valorMensalCentavos,
      stripeSubscriptionId: snapshot.vigente ? subscriptionId : null,
    },
    plano: snapshot.plano,
    status: snapshot.status,
  };
}

const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === "P2002";

async function sendPaymentFailedEmail(user: { email: string; nome: string }, frontendUrl: string): Promise<void> {
  const link = `${frontendUrl}/planos`;
  const result = await sendEmail({
    to: user.email,
    toName: user.nome,
    subject: "Kreato - Não conseguimos cobrar sua assinatura",
    text: `Olá, ${user.nome}! A cobrança da renovação da sua assinatura do Kreato falhou. Os recursos do plano pago ficam suspensos até o pagamento ser regularizado. Atualize a forma de pagamento em ${link}`,
    html: `<div style="font-family: sans-serif; padding: 20px;">
      <h2>Não conseguimos cobrar sua assinatura</h2>
      <p>Olá, ${escapeHtml(user.nome)}!</p>
      <p>A cobrança da renovação da sua assinatura do Kreato foi recusada. Os recursos do plano pago ficam suspensos até o pagamento ser regularizado.</p>
      <p><a href="${link}" style="display: inline-block; padding: 10px 20px; background-color: #1b1a17; color: #f6f4ee; text-decoration: none; border-radius: 6px;">Atualizar pagamento</a></p>
    </div>`,
  });
  if (!result.enviado) console.warn("[Stripe Webhook] Aviso de cobrança recusada não enviado:", result.erro);
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
        // Ativação sem cartão só existe sem Stripe configurado (desenvolvimento local)
        modoTeste: !stripe,
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
              return_url: `${frontendUrl}/planos?stripe_status=portal`,
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

      // Assinatura existente com a cobrança recusada: regulariza no portal em vez de abrir outra assinatura
      if (stripe && !isMockStripeId(user.stripeSubscriptionId) && !isMockStripeId(user.stripeCustomerId)) {
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: user.stripeCustomerId as string,
          return_url: `${frontendUrl}/planos?stripe_status=portal`,
        });
        return res.json({
          url: portalSession.url,
          message: "Sua assinatura tem um pagamento pendente. Atualize a forma de pagamento no portal.",
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
          return_url: `${frontendUrl}/planos?stripe_status=portal`,
        });
        return res.json({
          url: portalSession.url,
          message: `Configure ${PLAN_PRICING[plan].priceEnv} para trocar de plano direto pelo Kreato.`,
        });
      }

      const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId as string);
      const item = subscription.items.data[0];
      if (!item) return res.status(409).json({ error: "Assinatura sem itens no Stripe." });

      // A data do pedido garante uma mudança na assinatura: mesmo se o preço já for o de destino
      // (ex.: um webhook perdido antes), o Stripe envia o customer.subscription.updated e o plano sincroniza
      await stripe.subscriptions.update(subscription.id, {
        items: [{ id: item.id, price: priceId }],
        proration_behavior: "create_prorations",
        metadata: { ...subscription.metadata, plano: plan, trocaSolicitadaEm: new Date().toISOString() },
      });

      // O plano no banco muda quando o customer.subscription.updated chegar
      await logEvent({
        userId: user.id,
        acao: "PLAN_CHANGE_REQUESTED",
        req,
        entidade: "assinatura",
        detalhes: { de: fromPlan, para: plan },
      });
      return res.json({
        pendente: true,
        plano: plan,
        message: `Troca para o ${PLAN_PRICING[plan].nome} enviada ao Stripe. O plano muda assim que a confirmação chegar.`,
      });
    } else if (stripe) {
      // Com Stripe configurado, plano pago sem assinatura real não troca sem pagamento
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
   * POST /stripe/verify-session — corpo { sessionId } (ou { plano } sem Stripe configurado).
   * Só consulta: o plano NÃO muda porque o navegador voltou do checkout. Quem muda é o webhook;
   * o frontend chama esta rota até `confirmado` ficar true (o webhook já aplicou a assinatura).
   */
  async verifySession(req: Request, res: Response) {
    const { userId } = req;
    const { sessionId, plano } = req.body || {};

    try {
      const stripe = getStripe();

      if (!stripe) {
        // Sem chave do Stripe: ambiente de desenvolvimento, ativação simulada
        const simulatedPlan = parsePaidPlan(plano) ?? "CREATOR";
        const updatedUser = await prisma.usuario.update({
          where: { id: userId },
          data: { plano: simulatedPlan },
          select: userSelect,
        });
        await logEvent({
          userId,
          acao: "MOCK_UPGRADE_PLAN",
          req,
          entidade: "assinatura",
          detalhes: { plano: simulatedPlan },
        });
        return res.json({ user: updatedUser, confirmado: true });
      }

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

      const user = await prisma.usuario.findUnique({
        where: { id: userId },
        select: { ...userSelect, stripeSubscriptionId: true },
      });
      if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

      const { stripeSubscriptionId, ...publicUser } = user;
      const subscriptionId = idOf(session.subscription);
      const confirmado = !!subscriptionId && stripeSubscriptionId === subscriptionId && isPaidPlan(user.plano);

      return res.json({
        user: publicUser,
        confirmado,
        checkout: { status: session.status, pagamento: session.payment_status },
      });
    } catch (error: any) {
      console.error("Erro ao consultar sessão do Stripe:", error);
      return res.status(500).json({ error: "Erro ao consultar o pagamento no Stripe." });
    }
  }

  /**
   * POST /stripe/webhook — eventos assinados pelo Stripe (corpo bruto, ver server.ts).
   * Sem STRIPE_WEBHOOK_SECRET o endpoint recusa tudo: eventos sem assinatura poderiam ativar planos.
   * O estado da assinatura é sempre buscado no Stripe (a ordem de chegada dos eventos não importa)
   * e o id do evento é gravado junto com a mudança: o mesmo evento reenviado não é aplicado de novo.
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
      // Já processado: responde 200 sem refazer nada (o Stripe para de reenviar)
      if (await prisma.stripeEvento.findUnique({ where: { id: event.id }, select: { id: true } })) {
        return this.duplicateEvent(req, res, event);
      }

      const change = await this.changeForEvent(stripe, event);
      const user = change
        ? await prisma.usuario.findFirst({ where: change.where, select: { id: true, email: true, nome: true } })
        : null;

      try {
        await prisma.$transaction(async (tx) => {
          await tx.stripeEvento.create({ data: { id: event.id, tipo: event.type } });
          if (change) await tx.usuario.updateMany({ where: change.where, data: change.data });
        });
      } catch (error) {
        // Duas entregas simultâneas do mesmo evento: só a primeira grava
        if (isUniqueViolation(error)) return this.duplicateEvent(req, res, event);
        throw error;
      }

      const acao = WEBHOOK_ACTIONS[event.type];
      if (acao) {
        await logEvent({
          userId: user?.id ?? null,
          acao,
          req,
          entidade: "assinatura",
          entidadeId: event.id,
          detalhes: change
            ? { evento: event.type, plano: change.plano, status: change.status, aplicado: !!user }
            : { evento: event.type, aplicado: false },
        });
      }
      console.log(
        `[Stripe Webhook] ${event.type} (${event.id})` +
          (change ? ` -> usuário ${user?.id ?? "não encontrado"}: ${change.plano} / ${change.status}` : " ignorado")
      );

      if (change?.notifyPaymentFailed && user) {
        sendPaymentFailedEmail(user, getFrontendUrl(req)).catch((error) =>
          console.warn("[Stripe Webhook] Falha ao avisar cobrança recusada:", error?.message)
        );
      }

      return res.status(200).json({ received: true });
    } catch (error: any) {
      console.error("Erro ao processar webhook do Stripe:", error.message);
      // 500 faz o Stripe reenviar o evento depois (nada foi gravado)
      return res.status(500).json({ error: "Erro ao processar evento." });
    }
  }

  private async duplicateEvent(req: Request, res: Response, event: Stripe.Event) {
    console.log(`[Stripe Webhook] ${event.type} (${event.id}) já processado: ignorado.`);
    await logEvent({
      acao: "STRIPE_WEBHOOK_DUPLICATE",
      req,
      entidade: "assinatura",
      entidadeId: event.id,
      detalhes: { evento: event.type },
    });
    return res.status(200).json({ received: true, duplicado: true });
  }

  /** O que cada evento muda no usuário (null = evento sem efeito no banco) */
  private async changeForEvent(stripe: Stripe, event: Stripe.Event): Promise<WebhookChange | null> {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.client_reference_id || session.metadata?.userId;
        const customerId = idOf(session.customer);
        const subscriptionId = idOf(session.subscription);
        if (session.mode !== "subscription" || !userId || !customerId || !subscriptionId) return null;

        const snapshot = subscriptionSnapshot(await stripe.subscriptions.retrieve(subscriptionId));
        const change = subscriptionChange(customerId, subscriptionId, snapshot);
        // O checkout identifica o usuário direto e guarda o customer e a subscription nele
        return {
          ...change,
          where: { id: userId },
          data: { ...change.data, stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId },
        };
      }

      // Troca de plano, renovação, cancelamento agendado, mudança de status / fim da assinatura
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const payload = event.data.object;
        const customerId = idOf(payload.customer);
        if (!customerId) return null;
        const current = await stripe.subscriptions.retrieve(payload.id).catch(() => payload);
        return subscriptionChange(customerId, payload.id, subscriptionSnapshot(current));
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = idOf(invoice.customer);
        const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription);
        if (!customerId || !subscriptionId || !invoice.id) return null;

        // Se a fatura já foi paga numa nova tentativa, não há o que suspender
        const fresh = await stripe.invoices.retrieve(invoice.id);
        if (fresh.status === "paid") return null;

        const snapshot = subscriptionSnapshot(await stripe.subscriptions.retrieve(subscriptionId));
        const change = subscriptionChange(customerId, subscriptionId, snapshot);
        if (!snapshot.vigente) return change;

        // Inadimplente: o plano pago fica suspenso até o pagamento (o updated -> active devolve o plano)
        const status = ACTIVE_SUBSCRIPTION_STATUSES.has(snapshot.status) ? "past_due" : snapshot.status;
        return {
          where: { stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId },
          data: { plano: "FREE", statusAssinatura: status },
          plano: "FREE",
          status,
          notifyPaymentFailed: true,
        };
      }

      default:
        return null;
    }
  }

  /**
   * POST /stripe/portal — abre o portal do cliente do Stripe (trocar de plano, cartão, cancelar).
   * As mudanças feitas lá chegam pelos webhooks.
   */
  async portal(req: Request, res: Response) {
    try {
      const stripe = getStripe();
      if (!stripe) return res.status(503).json({ error: "Stripe não configurado neste ambiente." });

      const user = await prisma.usuario.findUnique({ where: { id: req.userId }, select: { stripeCustomerId: true } });
      if (!user || isMockStripeId(user.stripeCustomerId)) {
        return res.status(409).json({ error: "Você ainda não tem uma assinatura no Stripe. Assine um plano primeiro." });
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId as string,
        return_url: `${getFrontendUrl(req)}/planos?stripe_status=portal`,
      });
      await logEvent({ userId: req.userId, acao: "BILLING_PORTAL_OPENED", req, entidade: "assinatura" });
      return res.json({ url: session.url });
    } catch (error: any) {
      console.error("Erro ao abrir o portal do cliente:", error);
      return res.status(500).json({ error: "Não foi possível abrir o portal de assinatura." });
    }
  }

  /**
   * POST /stripe/mock-upgrade — corpo { plano? } — ativa um plano sem cartão.
   * Só sem Stripe configurado (desenvolvimento local): com Stripe, plano só muda pelo checkout + webhook.
   */
  async mockUpgrade(req: Request, res: Response) {
    const { userId } = req;
    if (getStripe()) {
      return res.status(403).json({ error: "Com o Stripe configurado, os planos só mudam pelo checkout." });
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
          statusAssinatura: null,
          valorMensalCentavos: null,
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
   * POST /stripe/cancel — cancela a assinatura.
   * Com Stripe: cancela lá e o plano volta ao Gratuito quando o customer.subscription.deleted chegar.
   * Sem Stripe (ou assinatura simulada): volta ao Gratuito na hora.
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
          await logEvent({
            userId,
            acao: "CANCEL_SUBSCRIPTION",
            req,
            entidade: "assinatura",
            detalhes: { planoAnterior: normalizePlan(user.plano) },
          });
          return res.json({
            pendente: true,
            message: "Cancelamento enviado ao Stripe. Você volta ao plano Gratuito assim que a confirmação chegar.",
          });
        } catch (err: any) {
          console.warn("Erro ao cancelar no Stripe API:", err.message);
          // Assinatura já inexistente no Stripe: segue com o rebaixamento local.
          // Outras falhas: não rebaixa, senão o usuário perderia o plano e continuaria sendo cobrado.
          if (err?.code !== "resource_missing") {
            return res.status(502).json({ error: "Não foi possível cancelar a assinatura no Stripe. Tente novamente." });
          }
        }
      }

      const updatedUser = await prisma.usuario.update({
        where: { id: userId },
        data: { plano: "FREE", stripeSubscriptionId: null, statusAssinatura: null, valorMensalCentavos: null },
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
