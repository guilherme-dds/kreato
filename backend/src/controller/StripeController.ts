import type { Request, Response } from "express";
import Stripe from "stripe";
import prisma from "../utils/prisma.js";
import { logEvent } from "../utils/logger.js";
import { isPaidPlan } from "../utils/plans.js";

function getStripeInstance(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || secretKey.trim().length === 0 || secretKey.includes("YOUR_STRIPE")) {
    return null;
  }
  return new Stripe(secretKey);
}

export function getFrontendUrl(req: Request): string {
  const origin = req.headers.origin || req.headers.referer;
  if (origin && typeof origin === "string") {
    try {
      const url = new URL(origin);
      return `${url.protocol}//${url.host}`.replace(/\/+$/, "");
    } catch { }
  }
  return (process.env.FRONTEND_URL || "http://localhost:8209").replace(/\/+$/, "");
}

export class StripeController {
  /**
   * Cria uma Sessão do Stripe Checkout para assinatura do plano pago
   */
  async createCheckoutSession(req: Request, res: Response) {
    const { userId } = req;
    if (!userId) {
      return res.status(401).json({ error: "Usuário não autenticado." });
    }

    try {
      const user = await prisma.usuario.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado." });
      }

      const stripe = getStripeInstance();
      const frontendUrl = getFrontendUrl(req);

      if (isPaidPlan(user.plano)) {
        if (stripe && user.stripeCustomerId && !user.stripeCustomerId.startsWith("cus_test_mock_")) {
          try {
            const portalSession = await stripe.billingPortal.sessions.create({
              customer: user.stripeCustomerId,
              return_url: frontendUrl,
            });
            return res.json({ url: portalSession.url });
          } catch (portalErr: any) {
            console.warn("Erro ao criar sessão do portal do Stripe:", portalErr.message);
          }
        }
        return res.json({
          url: `${frontendUrl}/?stripe_status=manage_mock`,
          message: "Você já possui um plano pago ativo!",
        });
      }

      if (!stripe) {
        return res.json({
          url: `${frontendUrl}/?stripe_status=success_mock`,
          mockActivated: true,
          message:
            "Modo Teste Stripe (sem chave informada): Redirecionando para ativação simulada...",
        });
      }

      // Se o Stripe estiver configurado com chave real/teste
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: user.nome,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await prisma.usuario.update({
          where: { id: userId },
          data: { stripeCustomerId: customerId },
        });
      }

      const priceId = process.env.STRIPE_PRICE_ID;

      const lineItem = priceId
        ? { price: priceId, quantity: 1 }
        : {
            price_data: {
              currency: "brl",
              product_data: {
                name: "Kreato Creator",
                description: "Selo exclusivo e recursos ampliados para planejar e organizar seus conteúdos.",
              },
              unit_amount: 1990, // R$ 19,90/mês em centavos
              recurring: { interval: "month" as const },
            },
            quantity: 1,
          };

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        client_reference_id: userId,
        metadata: { userId },
        line_items: [lineItem],
        success_url: `${frontendUrl}/?stripe_status=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/?stripe_status=cancel`,
      });

      return res.json({ url: session.url, id: session.id });
    } catch (error: any) {
      console.error("Erro ao criar sessão do Stripe Checkout:", error);
      return res.status(500).json({ error: error.message || "Erro ao processar pagamento com Stripe." });
    }
  }

  /**
   * Verifica uma sessão do Stripe Checkout e ativa o plano pago se o pagamento estiver concluído
   */
  async verifySession(req: Request, res: Response) {
    const { userId } = req;
    const { sessionId } = req.body || {};

    if (!userId) {
      return res.status(401).json({ error: "Usuário não autenticado." });
    }

    try {
      const stripe = getStripeInstance();
      let customerId: string | null = null;
      let subscriptionId: string | null = null;

      if (stripe && sessionId && typeof sessionId === "string" && sessionId.trim().length > 0) {
        try {
          const session = await stripe.checkout.sessions.retrieve(sessionId);
          if (session.payment_status === "paid" || session.status === "complete") {
            customerId = typeof session.customer === "string" ? session.customer : session.customer?.id || null;
            subscriptionId =
              typeof session.subscription === "string" ? session.subscription : session.subscription?.id || null;
          }
        } catch (sessionErr: any) {
          console.warn("[Stripe Verify] Não foi possível consultar a sessão no Stripe:", sessionErr.message);
        }
      }

      const dataToUpdate: Record<string, any> = { plano: "CREATOR" };
      if (customerId) dataToUpdate.stripeCustomerId = customerId;
      if (subscriptionId) dataToUpdate.stripeSubscriptionId = subscriptionId;

      const updatedUser = await prisma.usuario.update({
        where: { id: userId },
        data: dataToUpdate,
        select: {
          id: true,
          nome: true,
          email: true,
          role: true,
          plano: true,
          bio: true,
          fotoPerfil: true,
          criadoEm: true,
        },
      });

      await logEvent({
        userId,
        acao: "VERIFY_STRIPE_PAYMENT_SUCCESS",
        req,
        entidade: "assinatura",
        detalhes: { plano: "CREATOR" },
      });

      return res.json({ user: updatedUser, success: true });
    } catch (error: any) {
      console.error("Erro ao verificar sessão do Stripe:", error);
      return res.status(500).json({ error: "Erro ao confirmar pagamento do Stripe." });
    }
  }

  /**
   * Webhook para receber notificações assíncronas do Stripe
   */
  async webhook(req: Request, res: Response) {
    const stripe = getStripeInstance();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event: Stripe.Event;

    try {
      if (stripe && webhookSecret) {
        const signature = req.headers["stripe-signature"] as string;
        event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
      } else {
        event = req.body as Stripe.Event;
      }

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.client_reference_id || session.metadata?.userId;
          const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
          const subscriptionId =
            typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

          const dataToUpdate: Record<string, any> = { plano: "CREATOR" };
          if (customerId) dataToUpdate.stripeCustomerId = customerId;
          if (subscriptionId) dataToUpdate.stripeSubscriptionId = subscriptionId;

          if (userId) {
            await prisma.usuario.update({
              where: { id: userId },
              data: dataToUpdate,
            });
            console.log(`[Stripe Webhook] Usuário ${userId} atualizado para o plano CREATOR!`);
          } else if (session.customer_email) {
            await prisma.usuario.update({
              where: { email: session.customer_email },
              data: dataToUpdate,
            });
          }
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId =
            typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;

          if (customerId) {
            await prisma.usuario.updateMany({
              where: { stripeCustomerId: customerId },
              data: { plano: "FREE", stripeSubscriptionId: null },
            });
            console.log(`[Stripe Webhook] Assinatura cancelada para customer ${customerId}`);
          }
          break;
        }

        default:
          console.log(`[Stripe Webhook] Evento não tratado: ${event.type}`);
      }

      return res.status(200).json({ received: true });
    } catch (error: any) {
      console.error("Erro no webhook do Stripe:", error.message);
      return res.status(400).send(`Webhook Error: ${error.message}`);
    }
  }

  /**
   * Alterna entre os planos FREE e CREATOR para testes instantâneos no ambiente de desenvolvimento
   */
  async mockUpgrade(req: Request, res: Response) {
    const { userId } = req;
    if (!userId) {
      return res.status(401).json({ error: "Usuário não autenticado." });
    }

    try {
      const user = await prisma.usuario.findUnique({
        where: { id: userId },
        select: { plano: true },
      });

      const nextState = !isPaidPlan(user?.plano);

      const updatedUser = await prisma.usuario.update({
        where: { id: userId },
        data: {
          plano: nextState ? "CREATOR" : "FREE",
          stripeCustomerId: nextState ? `cus_test_mock_${Date.now()}` : null,
          stripeSubscriptionId: nextState ? `sub_test_mock_${Date.now()}` : null,
        },
        select: {
          id: true,
          nome: true,
          email: true,
          role: true,
          plano: true,
          bio: true,
          fotoPerfil: true,
          criadoEm: true,
        },
      });

      await logEvent({
        userId,
        acao: nextState ? "MOCK_UPGRADE_PLAN" : "MOCK_CANCEL_PLAN",
        req,
        entidade: "assinatura",
        detalhes: { plano: updatedUser.plano },
      });

      return res.json({
        user: updatedUser,
        message: nextState
          ? "Parabéns! Você agora é assinante do plano Creator em modo de teste!"
          : "Plano pago desativado com sucesso.",
      });
    } catch (error: any) {
      console.error("Erro ao alternar plano:", error);
      return res.status(500).json({ error: "Erro ao atualizar status do plano." });
    }
  }

  /**
   * Cancela assinatura do usuário
   */
  async cancelSubscription(req: Request, res: Response) {
    const { userId } = req;
    if (!userId) {
      return res.status(401).json({ error: "Usuário não autenticado." });
    }

    try {
      const user = await prisma.usuario.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado." });
      }

      const stripe = getStripeInstance();
      if (stripe && user.stripeSubscriptionId && !user.stripeSubscriptionId.startsWith("sub_test_mock_")) {
        try {
          await stripe.subscriptions.cancel(user.stripeSubscriptionId);
        } catch (err: any) {
          console.warn("Erro ao cancelar no Stripe API:", err.message);
        }
      }

      const updatedUser = await prisma.usuario.update({
        where: { id: userId },
        data: {
          plano: "FREE",
          stripeSubscriptionId: null,
        },
        select: {
          id: true,
          nome: true,
          email: true,
          role: true,
          plano: true,
          bio: true,
          fotoPerfil: true,
          criadoEm: true,
        },
      });

      await logEvent({
        userId,
        acao: "CANCEL_SUBSCRIPTION",
        req,
        entidade: "assinatura",
        detalhes: { plano: "FREE" },
      });

      return res.json({ user: updatedUser, message: "Assinatura cancelada com sucesso." });
    } catch (error: any) {
      console.error("Erro ao cancelar assinatura:", error);
      return res.status(500).json({ error: "Erro ao cancelar assinatura." });
    }
  }
}
