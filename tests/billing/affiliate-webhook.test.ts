import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  rpc: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/analytics/events", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/billing/plans", () => ({ getPlanByStripePrice: vi.fn() }));
vi.mock("@/lib/billing/stripe", () => ({
  getStripe: vi.fn(() => ({ webhooks: { constructEvent: mocks.constructEvent } })),
}));
vi.mock("@/lib/env/server", () => ({
  getServerEnv: vi.fn(() => ({ STRIPE_WEBHOOK_SECRET: "test-webhook-secret" })),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { POST } from "../../src/app/api/stripe/webhook/route";

function request() {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST", headers: { "stripe-signature": "sig" }, body: "raw",
  });
}
function deliver(type: Stripe.Event.Type, object: unknown, id = "evt_affiliate") {
  mocks.constructEvent.mockReturnValue({
    id, created: 1_780_000_000, type, data: { object },
  } as Stripe.Event);
  return POST(request());
}

describe("affiliate billing webhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: { ok: true, reason: "created" }, error: null });
    mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc });
  });

  it("creates one commission from a paid subscription invoice", async () => {
    const invoice = {
      id: "in_paid_1", amount_paid: 7900, currency: "sek",
      parent: {
        type: "subscription_details", quote_details: null,
        subscription_details: {
          metadata: { userId: "11111111-1111-4111-8111-111111111111" },
          subscription: "sub_1",
        },
      },
      payments: { data: [{ status: "paid", payment: { type: "payment_intent", payment_intent: "pi_1" } }] },
    } as unknown as Stripe.Invoice;
    const response = await deliver("invoice.paid", invoice, "evt_invoice_paid");
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("record_affiliate_commission", {
      p_referred_user_id: "11111111-1111-4111-8111-111111111111",
      p_source_event_id: "evt_invoice_paid",
      p_stripe_invoice_id: "in_paid_1",
      p_stripe_subscription_id: "sub_1",
      p_stripe_payment_intent_id: "pi_1",
      p_gross_amount_cents: 7900,
      p_currency: "sek",
      p_paid_at: expect.any(String),
    });
  });

  it("reverses commission when the charge is refunded", async () => {
    const charge = { id: "ch_1", payment_intent: "pi_1", amount_refunded: 7900 } as Stripe.Charge;
    const response = await deliver("charge.refunded", charge, "evt_refund");
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("reverse_affiliate_commission", {
      p_payment_intent_id: "pi_1",
      p_reason: "refund",
    });
  });

  it("reverses commission immediately when a charge dispute is created", async () => {
    const dispute = { id: "dp_1", payment_intent: "pi_1" } as Stripe.Dispute;
    const response = await deliver("charge.dispute.created", dispute, "evt_dispute");
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("reverse_affiliate_commission", {
      p_payment_intent_id: "pi_1",
      p_reason: "chargeback",
    });
  });
});
