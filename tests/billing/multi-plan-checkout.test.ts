import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(), getBillingReadiness: vi.fn(), getStripe: vi.fn(),
  getUserSubscription: vi.fn(), requireUser: vi.fn()
}));
vi.mock("@/lib/analytics/events", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/billing/readiness", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing/readiness")>("@/lib/billing/readiness");
  return { ...actual, getBillingReadiness: mocks.getBillingReadiness, reportBillingReadiness: vi.fn() };
});
vi.mock("@/lib/billing/stripe", () => ({ getStripe: mocks.getStripe, getSafeStripeErrorDiagnostic: vi.fn(() => ({ restrictedKeyPermissionError: false })) }));
vi.mock("@/lib/billing/subscriptions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing/subscriptions")>("@/lib/billing/subscriptions");
  return { ...actual, getUserSubscription: mocks.getUserSubscription };
});
vi.mock("@/lib/env/server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env/server")>("@/lib/env/server");
  return { ...actual, getServerEnv: vi.fn(() => ({
    NEXT_PUBLIC_APP_URL: "https://stockbox.test", STRIPE_RESTRICTED_KEY: "rk_test",
    STRIPE_PRICE_BASIC_MONTHLY: "price_basic", STRIPE_COUPON_BASIC_LAUNCH: "coupon_basic",
    STRIPE_PRICE_STANDARD_MONTHLY: "price_standard", STRIPE_COUPON_STANDARD_LAUNCH: "coupon_standard",
    STRIPE_PRICE_PREMIUM_MONTHLY: "price_pro", STRIPE_COUPON_PREMIUM_LAUNCH: "coupon_pro",
    STRIPE_PRICE_ELITE_MONTHLY: "price_elite",
    LEGAL_VAT_MODE: "vat_registered",
    LEGAL_VAT_NUMBER: "SE000000000001"
  })) };
});
import { POST } from "../../src/app/api/stripe/checkout/route";
const request = (plan: string) => new Request("http://localhost/api/stripe/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });

describe("multi-plan checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user_1", email: "user@example.com", role: "customer" });
    mocks.getBillingReadiness.mockReturnValue({ checkoutReady: true, supabaseConfigured: true, restrictedKeyPresent: true, basicPricePresent: true, launchCouponPresent: true, paidCatalogReady: true, legalCommerceReady: true, missingVariables: [] });
    mocks.getUserSubscription.mockResolvedValue({ ok: true, subscription: { planKey: "free", status: "active", stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, cancelAt: null, launchOfferRedeemedAt: null, createdAt: null } });
    mocks.createSession.mockResolvedValue({ url: "https://checkout.stripe.test/session" });
    mocks.getStripe.mockReturnValue({ checkout: { sessions: { create: mocks.createSession } } });
  });
  it.each([
    ["basic", "price_basic", "coupon_basic", "basic_launch_3_months"],
    ["standard", "price_standard", "coupon_standard", "standard_launch_3_months"],
    ["premium", "price_pro", "coupon_pro", "premium_launch_3_months"],
  ])("opens %s with its canonical price and launch coupon", async (plan, price, coupon, offer) => {
    const response = await POST(request(plan));
    expect(response.status).toBe(200);
    const params = mocks.createSession.mock.calls[0]?.[0];
    expect(params.line_items).toEqual([{ price, quantity: 1 }]);
    expect(params.automatic_tax).toEqual({ enabled: true });
    expect(params.discounts).toEqual([{ coupon }]);
    expect(params.metadata).toMatchObject({ plan, offer });
    expect(params.subscription_data.metadata).toMatchObject({ plan, offer });
  });

  it("opens Elite at regular price without a launch coupon", async () => {
    const response = await POST(request("elite"));
    expect(response.status).toBe(200);
    const params = mocks.createSession.mock.calls[0]?.[0];
    expect(params.line_items).toEqual([{ price: "price_elite", quantity: 1 }]);
    expect(params.discounts).toBeUndefined();
    expect(params.metadata).toMatchObject({ plan: "elite", offer: "none" });
  });

  it("routes an existing paid subscriber to billing management instead of creating a second subscription", async () => {
    mocks.getUserSubscription.mockResolvedValue({ ok: true, subscription: { planKey: "standard", status: "active", stripeCustomerId: "cus_existing", stripeSubscriptionId: "sub_existing", currentPeriodEnd: null, cancelAtPeriodEnd: false, cancelAt: null, launchOfferRedeemedAt: null, createdAt: null } });
    const response = await POST(request("premium"));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ redirectUrl: "/settings/billing" });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});
