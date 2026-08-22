import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

type SubscriptionRow = {
  id: string;
  user_id: string;
  plan_key: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  current_period_end: string | null;
  updated_at?: string;
};

const mocks = vi.hoisted(() => ({
  captureServerEvent: vi.fn(),
  constructEvent: vi.fn(),
  createAdminClient: vi.fn(),
  from: vi.fn(),
  getPlanByStripePrice: vi.fn(),
  upsert: vi.fn()
}));

vi.mock("@/lib/analytics/events", () => ({
  captureServerEvent: mocks.captureServerEvent
}));
vi.mock("@/lib/billing/plans", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing/plans")>(
    "@/lib/billing/plans"
  );
  return {
    ...actual,
    getPlanByStripePrice: mocks.getPlanByStripePrice
  };
});
vi.mock("@/lib/billing/stripe", () => ({
  getStripe: vi.fn(() => ({
    webhooks: { constructEvent: mocks.constructEvent }
  }))
}));
vi.mock("@/lib/env/server", () => ({
  getServerEnv: vi.fn(() => ({
    STRIPE_WEBHOOK_SECRET: "whsec_test"
  }))
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient
}));

import { POST } from "../../src/app/api/stripe/webhook/route";

let rows: SubscriptionRow[];
let upsertError: { code: string; message: string } | null;

function subscription(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: "sub_basic",
    customer: "cus_basic",
    metadata: { userId: "user_1" },
    status: "active",
    items: {
      data: [
        {
          price: { id: "price_basic" },
          current_period_end: 1_800_000_000
        }
      ]
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
  type: Stripe.Event.Type = "customer.subscription.created"
) {
  mocks.constructEvent.mockReturnValue({
    type,
    data: { object: stripeSubscription }
  } as Stripe.Event);
  return POST(webhookRequest());
}

describe("Stripe subscription webhook", () => {
  beforeEach(() => {
    rows = [
      {
        id: "existing_row",
        user_id: "user_1",
        plan_key: "free",
        status: "active",
        stripe_customer_id: null,
        stripe_subscription_id: null,
        stripe_price_id: null,
        current_period_end: null
      }
    ];
    upsertError = null;

    vi.clearAllMocks();
    mocks.getPlanByStripePrice.mockImplementation((priceId: string | null | undefined) =>
      priceId === "price_basic" ? { key: "basic" } : null
    );
    mocks.from.mockImplementation((table: string) => {
      expect(table).toBe("subscriptions");
      return { upsert: mocks.upsert };
    });
    mocks.upsert.mockImplementation(
      async (
        values: Omit<SubscriptionRow, "id">,
        options?: { onConflict?: string }
      ) => {
        if (upsertError) return { error: upsertError };

        if (options?.onConflict === "user_id") {
          const existingIndex = rows.findIndex((row) => row.user_id === values.user_id);
          if (existingIndex >= 0) {
            rows[existingIndex] = { ...rows[existingIndex], ...values };
          } else {
            rows.push({ id: `row_${rows.length + 1}`, ...values });
          }
        } else {
          rows.push({ id: `row_${rows.length + 1}`, ...values });
        }

        return { error: null };
      }
    );
    mocks.createAdminClient.mockReturnValue({ from: mocks.from });
  });

  it("updates the existing Free row to Basic without creating a duplicate", async () => {
    const response = await deliver(subscription());

    expect(response.status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "existing_row",
      user_id: "user_1",
      plan_key: "basic",
      status: "active",
      stripe_customer_id: "cus_basic",
      stripe_subscription_id: "sub_basic",
      stripe_price_id: "price_basic",
      current_period_end: new Date(1_800_000_000 * 1000).toISOString()
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user_1", plan_key: "basic" }),
      { onConflict: "user_id" }
    );
    expect(mocks.constructEvent).toHaveBeenCalledWith(
      "raw-webhook-body",
      "sig_test",
      "whsec_test"
    );
  });

  it("returns 500 and logs safe diagnostics when Supabase upsert fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    upsertError = {
      code: "23505",
      message:
        "Conflict for user@example.com using whsec_do_not_log and sb_secret_do_not_log"
    };

    const response = await deliver(subscription());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Webhook processing failed." });
    expect(consoleError).toHaveBeenCalledWith(
      "[billing] Supabase subscription sync failed.",
      {
        subscriptionId: "sub_basic",
        userId: "user_1",
        supabaseErrorCode: "23505",
        supabaseErrorMessage: "Conflict for [redacted] using [redacted] and [redacted]"
      }
    );
    expect(mocks.captureServerEvent).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("returns 500 when metadata.userId is missing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await deliver(subscription({ metadata: {} }));

    expect(response.status).toBe(500);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "[billing] Stripe subscription is missing metadata.userId.",
      { subscriptionId: "sub_basic", userId: null }
    );
    consoleError.mockRestore();
  });

  it("returns 500 when the Stripe price is unknown", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const unknownPriceSubscription = subscription({
      items: {
        data: [{ price: { id: "price_unknown" }, current_period_end: null }]
      } as unknown as Stripe.ApiList<Stripe.SubscriptionItem>
    });

    const response = await deliver(unknownPriceSubscription);

    expect(response.status).toBe(500);
    expect(mocks.upsert).not.toHaveBeenCalled();
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
    mocks.createAdminClient.mockReturnValue(null);

    const response = await deliver(subscription());

    expect(response.status).toBe(500);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "[billing] Supabase admin client is unavailable for subscription sync.",
      { subscriptionId: "sub_basic", userId: "user_1" }
    );
    consoleError.mockRestore();
  });
});
