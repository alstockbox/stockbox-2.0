import { describe, expect, it } from "vitest";
import { commerciallyActivePlans, findPlan, isPlanPurchasable } from "../../src/lib/billing/plans";
import { effectivePlanKey, subscriptionBillingState, type UserSubscription } from "../../src/lib/billing/subscriptions";
import { getPricingAction } from "../../src/lib/billing/pricing-state";

function subscription(planKey: UserSubscription["planKey"], status = "active"): UserSubscription {
  return {
    planKey,
    status,
    stripeCustomerId: "cus_release",
    stripeSubscriptionId: "sub_release",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    cancelAt: null,
    launchOfferRedeemedAt: null,
    createdAt: null,
  };
}

describe("commercial release plan ladder", () => {
  it("activates the approved five plan ladder with exact prices and analysis quotas", () => {
    expect(commerciallyActivePlans.map((plan) => plan.key)).toEqual(["free", "basic", "standard", "premium", "elite"]);
    expect(findPlan("free")?.entitlements.monthlyAnalyses).toBe(3);
    expect(findPlan("basic")).toMatchObject({ name: "Basic", monthlyPriceSek: 69, entitlements: { monthlyAnalyses: 10 } });
    expect(findPlan("standard")).toMatchObject({ name: "Standard", monthlyPriceSek: 119, entitlements: { monthlyAnalyses: 35 } });
    expect(findPlan("premium")).toMatchObject({ name: "Pro", monthlyPriceSek: 179, entitlements: { monthlyAnalyses: 70 } });
    expect(findPlan("elite")).toMatchObject({ name: "Elite", monthlyPriceSek: 399, entitlements: { monthlyAnalyses: 350 } });
  });
  it("models the approved three-month launch offers and no Elite launch", () => {
    expect(findPlan("basic")?.launchOffer).toMatchObject({ monthlyPriceSek: 49, durationMonths: 3, thenMonthlyPriceSek: 69, stripeCouponEnv: "STRIPE_COUPON_BASIC_LAUNCH" });
    expect(findPlan("standard")?.launchOffer).toMatchObject({ monthlyPriceSek: 79, durationMonths: 3, thenMonthlyPriceSek: 119, stripeCouponEnv: "STRIPE_COUPON_STANDARD_LAUNCH" });
    expect(findPlan("premium")?.launchOffer).toMatchObject({ monthlyPriceSek: 159, durationMonths: 3, thenMonthlyPriceSek: 179, stripeCouponEnv: "STRIPE_COUPON_PREMIUM_LAUNCH" });
    expect(findPlan("elite")?.launchOffer).toBeUndefined();
    for (const key of ["basic", "standard", "premium", "elite"] as const) {
      const plan = findPlan(key);
      expect(plan && isPlanPurchasable(plan)).toBe(true);
    }
  });

  it.each(["basic", "standard", "premium", "elite"] as const)("treats active %s subscriptions generically", (key) => {
    const active = subscription(key);
    expect(effectivePlanKey(active)).toBe(key);
    expect(subscriptionBillingState(active)).toBe(key);
    expect(getPricingAction(key, key)).toMatchObject({ kind: "portal", current: true });
  });

  it("lets a Free user start checkout for every paid tier", () => {
    for (const key of ["basic", "standard", "premium", "elite"] as const) {
      expect(getPricingAction(key, "free")).toMatchObject({ kind: "checkout", current: false });
    }
  });
});
