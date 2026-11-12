import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { monthlyAmountCents, planFromSubscription, subscriptionSnapshot } from "../src/utils/billing.js";

process.env.STRIPE_PRICE_CREATOR = "price_creator_test";
process.env.STRIPE_PRICE_STUDIO = "price_studio_test";

function subscription(
  status: Stripe.Subscription.Status,
  priceId: string,
  amount: number,
  options: { interval?: "month" | "year"; metadataPlan?: string; quantity?: number } = {}
): Stripe.Subscription {
  return {
    id: "sub_test",
    status,
    metadata: options.metadataPlan ? { plano: options.metadataPlan } : {},
    items: {
      data: [
        {
          quantity: options.quantity ?? 1,
          price: { id: priceId, unit_amount: amount, recurring: { interval: options.interval ?? "month", interval_count: 1 } },
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

describe("assinatura do Stripe -> plano no banco", () => {
  it("troca pelo portal vale pelo Price ID, não pela metadata do checkout", () => {
    // Assinou Creator no checkout e trocou para Studio no portal: a metadata continua dizendo CREATOR
    const sub = subscription("active", "price_studio_test", 7990, { metadataPlan: "CREATOR" });
    assert.equal(planFromSubscription(sub), "STUDIO");
  });

  it("sem Price ID conhecido, usa a metadata gravada no checkout", () => {
    assert.equal(planFromSubscription(subscription("active", "price_inline", 2990, { metadataPlan: "STUDIO" })), "STUDIO");
  });

  it("ativa libera o plano e guarda o valor mensal", () => {
    assert.deepEqual(subscriptionSnapshot(subscription("active", "price_creator_test", 2990)), {
      plano: "CREATOR",
      status: "active",
      vigente: true,
      valorMensalCentavos: 2990,
    });
  });

  it("inadimplente (past_due) não continua no plano pago", () => {
    const snapshot = subscriptionSnapshot(subscription("past_due", "price_studio_test", 7990));
    assert.equal(snapshot.plano, "FREE");
    assert.equal(snapshot.vigente, true);
    assert.equal(snapshot.status, "past_due");
  });

  it("cancelada volta ao Gratuito e sai do MRR", () => {
    const snapshot = subscriptionSnapshot(subscription("canceled", "price_creator_test", 2990));
    assert.equal(snapshot.plano, "FREE");
    assert.equal(snapshot.vigente, false);
    assert.equal(snapshot.valorMensalCentavos, null);
  });

  it("valor mensal converte plano anual e soma a quantidade", () => {
    assert.equal(monthlyAmountCents(subscription("active", "price_x", 35880, { interval: "year" })), 2990);
    assert.equal(monthlyAmountCents(subscription("active", "price_x", 2990, { quantity: 2 })), 5980);
  });
});
