import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  getBillingReadiness: vi.fn(),
  getStripe: vi.fn(),
  getUserSubscription: vi.fn()
}));

vi.mock("@/lib/analytics/events", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => ({ id: "user_1", email: "user@example.com", role: "customer" }))
}));
vi.mock("@/lib/billing/readiness", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing/readiness")>(
    "@/lib/billing/readiness"
  );
  return {
    ...actual,
    getBillingReadiness: mocks.getBillingReadiness,
    reportBillingReadiness: vi.fn()
  };
});
vi.mock("@/lib/billing/stripe", () => ({
  getStripe: mocks.getStripe,
  randomIntegrationIdentifier: vi.fn(() => "stockbox_checkout_abcdefgh")
}));
vi.mock("@/lib/billing/subscriptions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing/subscriptions")>(
    "@/lib/billing/subscriptions"
  );
  return { ...actual, getUserSubscription: mocks.getUserSubscription };
});
vi.mock("@/lib/env/server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env/server")>("@/lib/env/server");
  return {
    ...actual,
    getServerEnv: vi.fn(() => ({
      NEXT_PUBLIC_APP_URL: "https://stockbox.test",
      STRIPE_RESTRICTED_KEY: "rk_test",
      STRIPE_PRICE_BASIC_MONTHLY: "price_basic",
      STRIPE_COUPON_BASIC_LAUNCH: "coupon_launch"
    }))
  };
});

import { POST } from "../../src/app/api/stripe/checkout/route";

function checkoutRequest() {
  return new Request("http://localhost/api/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan: "basic" })
  });
}

describe("Basic checkout flow", () => {
  beforeEach(() => {
    mocks.createSession.mockReset();
    mocks.getBillingReadiness.mockReset();
    mocks.getStripe.mockReset();
    mocks.getUserSubscription.mockReset();
    mocks.createSession.mockResolvedValue({ url: "https://checkout.stripe.test/session" });
    mocks.getBillingReadiness.mockReturnValue({
      checkoutReady: true,
      supabaseConfigured: true,
      restrictedKeyPresent: true,
      basicPricePresent: true,
      launchCouponPresent: true,
      missingVariables: []
    });
    mocks.getStripe.mockReturnValue({ checkout: { sessions: { create: mocks.createSession } } });
  });

  it("opens Checkout for a Free user", async () => {
    mocks.getUserSubscription.mockResolvedValue({
      ok: true,
      subscription: {
        planKey: "free",
        status: "active",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
        createdAt: null
      }
    });

    const response = await POST(checkoutRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://checkout.stripe.test/session"
    });
    expect(mocks.createSession).toHaveBeenCalledOnce();
  });

  it("routes an active Basic user to billing management without creating Checkout", async () => {
    mocks.getBillingReadiness.mockReturnValue({
      checkoutReady: false,
      supabaseConfigured: true,
      restrictedKeyPresent: true,
      basicPricePresent: true,
      launchCouponPresent: false,
      missingVariables: ["STRIPE_COUPON_BASIC_LAUNCH"]
    });
    mocks.getUserSubscription.mockResolvedValue({
      ok: true,
      subscription: {
        planKey: "basic",
        status: "active",
        stripeCustomerId: "cus_existing",
        stripeSubscriptionId: "sub_existing",
        currentPeriodEnd: null,
        createdAt: null
      }
    });

    const response = await POST(checkoutRequest());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      redirectUrl: "/settings/billing"
    });
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.getStripe).not.toHaveBeenCalled();
  });
});
