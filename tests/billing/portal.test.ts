import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPortalSession: vi.fn(),
  getUserSubscription: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => ({ id: "user_1", email: "user@example.com", role: "customer" }))
}));
vi.mock("@/lib/billing/stripe", () => ({
  getStripe: vi.fn(() => ({
    billingPortal: { sessions: { create: mocks.createPortalSession } }
  }))
}));
vi.mock("@/lib/billing/subscriptions", () => ({
  getUserSubscription: mocks.getUserSubscription
}));
vi.mock("@/lib/env/server", () => ({
  getServerEnv: vi.fn(() => ({ NEXT_PUBLIC_APP_URL: "https://stockbox.test" }))
}));

import { POST } from "../../src/app/api/stripe/portal/route";

describe("Stripe Customer Portal", () => {
  beforeEach(() => {
    mocks.createPortalSession.mockReset();
    mocks.getUserSubscription.mockReset();
  });

  it("opens billing management for a Basic customer", async () => {
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
    mocks.createPortalSession.mockResolvedValue({ url: "https://billing.stripe.test/portal" });

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://billing.stripe.test/portal"
    });
    expect(mocks.createPortalSession).toHaveBeenCalledWith({
      customer: "cus_existing",
      return_url: "https://stockbox.test/settings/billing"
    });
  });
});
