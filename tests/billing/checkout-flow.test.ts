import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  getBillingReadiness: vi.fn(),
  getServerEnv: vi.fn(),
  getStripe: vi.fn(),
  getUserSubscription: vi.fn(),
  requireUser: vi.fn()
}));

vi.mock("@/lib/analytics/events", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireUser: mocks.requireUser
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
  getSafeStripeErrorDiagnostic: vi.fn(() => ({
    type: "StripePermissionError",
    code: "permission_denied",
    param: "checkout.sessions",
    requestId: "req_test",
    message: "Permission denied.",
    restrictedKeyPermissionError: true
  }))
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
    getServerEnv: mocks.getServerEnv
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
    mocks.getServerEnv.mockReset();
    mocks.getStripe.mockReset();
    mocks.getUserSubscription.mockReset();
    mocks.requireUser.mockReset();
    mocks.requireUser.mockResolvedValue({ id: "user_1", email: "user@example.com", role: "customer" });
    mocks.createSession.mockResolvedValue({ url: "https://checkout.stripe.test/session" });
    mocks.getServerEnv.mockReturnValue({
      NEXT_PUBLIC_APP_URL: "https://stockbox.test",
      STRIPE_RESTRICTED_KEY: "rk_test",
      STRIPE_PRICE_BASIC_MONTHLY: "price_basic",
      STRIPE_COUPON_BASIC_LAUNCH: "coupon_launch",
      LEGAL_VAT_MODE: "small_business_exempt"
    });
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

  it("requires authentication before malformed checkout validation details are exposed", async () => {
    const authRedirect = new Error("AUTH_REDIRECT");
    mocks.requireUser.mockRejectedValue(authRedirect);
    const request = new Request("http://localhost/api/stripe/checkout", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
    });
    await expect(POST(request)).rejects.toBe(authRedirect);
    expect(mocks.getBillingReadiness).not.toHaveBeenCalled();
    expect(mocks.getUserSubscription).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
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
    expect(mocks.createSession).toHaveBeenCalledWith({
      mode: "subscription",
      line_items: [{ price: "price_basic", quantity: 1 }],
      success_url: "https://stockbox.test/settings/billing?checkout=success",
      cancel_url: "https://stockbox.test/pricing?checkout=cancelled",
      customer_email: "user@example.com",
      client_reference_id: "user_1",
      discounts: [{ coupon: "coupon_launch" }],
      metadata: {
        userId: "user_1",
        plan: "basic",
        offer: "basic_launch_3_months"
      },
      subscription_data: {
        metadata: {
          userId: "user_1",
          plan: "basic",
          offer: "basic_launch_3_months"
        }
      }
    });
    expect(mocks.createSession.mock.calls[0]?.[0]).not.toHaveProperty(
      "integration_identifier"
    );
    expect(mocks.createSession.mock.calls[0]?.[0]).not.toHaveProperty("customer");
  });

  it("enables Stripe automatic tax when the seller is VAT registered", async () => {
    mocks.getServerEnv.mockReturnValue({
      NEXT_PUBLIC_APP_URL: "https://stockbox.test",
      STRIPE_RESTRICTED_KEY: "rk_test",
      STRIPE_PRICE_BASIC_MONTHLY: "price_basic",
      STRIPE_COUPON_BASIC_LAUNCH: "coupon_launch",
      LEGAL_VAT_MODE: "vat_registered",
      LEGAL_VAT_NUMBER: "SE000000000001"
    });
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
    expect(mocks.createSession.mock.calls[0]?.[0]).toMatchObject({
      automatic_tax: { enabled: true }
    });
  });

  it.each(["canceled", "incomplete_expired"])(
    "opens Checkout without reusing the customer after Basic becomes %s",
    async (status) => {
      mocks.getUserSubscription.mockResolvedValue({
        ok: true,
        subscription: {
          planKey: "basic",
          status,
          stripeCustomerId: "cus_historical",
          stripeSubscriptionId: "sub_historical",
          currentPeriodEnd: null,
          createdAt: null
        }
      });

      const response = await POST(checkoutRequest());

      expect(response.status).toBe(200);
      expect(mocks.createSession).toHaveBeenCalledOnce();
      const params = mocks.createSession.mock.calls[0]?.[0];
      expect(params).not.toHaveProperty("customer");
      expect(params).toHaveProperty("customer_email", "user@example.com");
    }
  );

  it("does not reapply the launch coupon after a previous Basic subscription redeemed it", async () => {
    mocks.getUserSubscription.mockResolvedValue({
      ok: true,
      subscription: {
        planKey: "basic",
        status: "canceled",
        stripeCustomerId: "cus_historical",
        stripeSubscriptionId: "sub_historical",
        currentPeriodEnd: null,
        createdAt: "2026-08-01T00:00:00.000Z",
        cancelAtPeriodEnd: false,
        cancelAt: null,
        launchOfferRedeemedAt: "2026-08-01T00:00:00.000Z"
      }
    });

    const response = await POST(checkoutRequest());

    expect(response.status).toBe(200);
    const params = mocks.createSession.mock.calls[0]?.[0];
    expect(params.discounts).toBeUndefined();
    expect(params.metadata).toMatchObject({ offer: "none" });
    expect(params.subscription_data?.metadata).toMatchObject({ offer: "none" });
  });

  it("logs safe restricted-key diagnostics when Stripe rejects Checkout", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
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
    mocks.createSession.mockRejectedValue(new Error("not logged"));

    const response = await POST(checkoutRequest());

    expect(response.status).toBe(503);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("restricted-key permission denied"),
      {
        type: "StripePermissionError",
        code: "permission_denied",
        param: "checkout.sessions",
        requestId: "req_test",
        message: "Permission denied.",
        restrictedKeyPermissionError: true
      }
    );
    consoleError.mockRestore();
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
