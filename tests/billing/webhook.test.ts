import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureServerEvent: vi.fn(),
  constructEvent: vi.fn(),
  createAdminClient: vi.fn(),
  getPlanByStripePrice: vi.fn(),
  rpc: vi.fn()
}));

vi.mock("@/lib/analytics/events", () => ({
  captureServerEvent: mocks.captureServerEvent
}));
vi.mock("@/lib/billing/plans", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing/plans")>(
    "@/lib/billing/plans"
  );
  return { ...actual, getPlanByStripePrice: mocks.getPlanByStripePrice };
});
vi.mock("@/lib/billing/stripe", () => ({
  getStripe: vi.fn(() => ({
    webhooks: { constructEvent: mocks.constructEvent }
  }))
}));
vi.mock("@/lib/env/server", () => ({
  getServerEnv: vi.fn(() => ({ STRIPE_WEBHOOK_SECRET: "whsec_test" }))
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient
}));

import { POST } from "../../src/app/api/stripe/webhook/route";

function subscription(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: "sub_basic",
    created: 1_700_000_000,
    customer: "cus_basic",
    metadata: { userId: "user_1" },
    status: "active",
    items: {
      data: [{ price: { id: "price_basic" }, current_period_end: 1_800_000_000 }]
    },
    ...overrides
  } as Stripe.Subscription;
}

function webhookRequest() {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "sig_test" },
    body: "raw-webhook-body"
  });
}

function deliver(
  stripeSubscription: Stripe.Subscription,
  type: Stripe.Event.Type = "customer.subscription.created",
  eventOverrides: Partial<Stripe.Event> = {}
) {
  mocks.constructEvent.mockReturnValue({
    id: "evt_test",
    created: 1_710_000_000,
    type,
    data: { object: stripeSubscription },
    ...eventOverrides
  } as Stripe.Event);
  return POST(webhookRequest());
}

describe("Stripe subscription webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPlanByStripePrice.mockImplementation((priceId: string | null | undefined) =>
      priceId === "price_basic" ? { key: "basic" } : null
    );
    mocks.rpc.mockResolvedValue({
      data: { applied: true, reason: "applied" },
      error: null
    });
    mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc });
  });

  it("routes a valid subscription through the atomic RPC", async () => {
    const response = await deliver(subscription());
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "sync_subscription_from_stripe",
      expect.objectContaining({
        p_user_id: "user_1",
        p_event_id: "evt_test",
        p_event_created: 1_710_000_000,
        p_event_type: "customer.subscription.created",
        p_stripe_subscription_id: "sub_basic",
        p_subscription_created: 1_700_000_000,
        p_stripe_customer_id: "cus_basic",
        p_stripe_price_id: "price_basic",
        p_plan_key: "basic",
        p_status: "active",
        p_current_period_end: new Date(1_800_000_000 * 1000).toISOString()
      })
    );
    expect(mocks.constructEvent).toHaveBeenCalledWith(
      "raw-webhook-body",
      "sig_test",
      "whsec_test"
    );
    expect(mocks.captureServerEvent).toHaveBeenCalledWith(
      "subscription_started",
      { subscriptionId: "sub_basic" }
    );
  });

  it("persists scheduled cancellation and launch-offer redemption through the ordered RPC", async () => {
    const response = await deliver(subscription({
      metadata: { userId: "user_1", plan: "basic", offer: "basic_launch_3_months" },
      cancel_at_period_end: true,
      cancel_at: 1_800_000_000,
    }), "customer.subscription.updated");

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "sync_subscription_from_stripe",
      expect.objectContaining({
        p_cancel_at_period_end: true,
        p_cancel_at: new Date(1_800_000_000 * 1000).toISOString(),
        p_launch_offer_redeemed: true,
      })
    );
  });

  it("maps customer.subscription.deleted to canceled", async () => {
    const response = await deliver(
      subscription({ status: "active" }),
      "customer.subscription.deleted"
    );
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "sync_subscription_from_stripe",
      expect.objectContaining({ p_status: "canceled" })
    );
    expect(mocks.captureServerEvent).toHaveBeenCalledWith(
      "subscription_cancelled",
      { subscriptionId: "sub_basic" }
    );
  });

  it.each(["duplicate_event", "stale_event", "stale_subscription"])(
    "does not emit analytics when RPC reports %s",
    async (reason) => {
      mocks.rpc.mockResolvedValueOnce({
        data: { applied: false, reason },
        error: null
      });
      const response = await deliver(subscription());
      expect(response.status).toBe(200);
      expect(mocks.captureServerEvent).not.toHaveBeenCalled();
    }
  );

  it("returns 500 and logs sanitized diagnostics when the RPC fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "23505",
        message: "Conflict user@example.com whsec_do_not_log sb_secret_do_not_log"
      }
    });
    const response = await deliver(subscription());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Webhook processing failed." });
    expect(consoleError).toHaveBeenCalledWith(
      "[billing] Supabase subscription sync failed.",
      expect.objectContaining({
        subscriptionId: "sub_basic",
        userId: "user_1",
        supabaseErrorCode: "23505",
        supabaseErrorMessage: "Conflict [redacted] [redacted] [redacted]"
      })
    );
    expect(mocks.captureServerEvent).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("returns 500 when metadata.userId is missing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await deliver(subscription({ metadata: {} }));
    expect(response.status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "[billing] Stripe subscription is missing metadata.userId.",
      { subscriptionId: "sub_basic", userId: null }
    );
    consoleError.mockRestore();
  });

  it("returns 500 when the Stripe price is unknown", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await deliver(subscription({
      items: {
        data: [{ price: { id: "price_unknown" }, current_period_end: null }]
      } as unknown as Stripe.ApiList<Stripe.SubscriptionItem>
    }));
    expect(response.status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "[billing] Stripe subscription price does not map to a StockBox plan.",
      {
        subscriptionId: "sub_basic",
        userId: "user_1",
        stripePriceId: "price_unknown"
      }
    );
    consoleError.mockRestore();
  });

  it("returns 500 when the Supabase admin client is unavailable", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.createAdminClient.mockReturnValueOnce(null);
    const response = await deliver(subscription());
    expect(response.status).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "[billing] Supabase admin client is unavailable for subscription sync.",
      { subscriptionId: "sub_basic", userId: "user_1" }
    );
    consoleError.mockRestore();
  });
});
