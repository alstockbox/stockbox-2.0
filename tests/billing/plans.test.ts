import { describe, expect, it } from "vitest";
import {
  commerciallyActivePlans,
  findPlan,
  isPlanPurchasable,
  plans
} from "../../src/lib/billing/plans";

describe("billing plan catalog", () => {
  it("exposes only Free and Basic as commercially active", () => {
    expect(commerciallyActivePlans.map((plan) => plan.key)).toEqual(["free", "basic"]);
  });

  it("keeps future plans unpriced and unavailable", () => {
    for (const key of ["standard", "premium", "elite"] as const) {
      const plan = findPlan(key);
      expect(plan?.commercialStatus).toBe("inactive");
      expect(plan?.monthlyPriceSek).toBeNull();
      expect(plan && isPlanPurchasable(plan)).toBe(false);
    }
  });

  it("models the approved Basic launch offer", () => {
    const basic = findPlan("basic");
    expect(basic?.monthlyPriceSek).toBe(79);
    expect(basic?.launchOffer).toMatchObject({
      monthlyPriceSek: 49,
      durationMonths: 3,
      thenMonthlyPriceSek: 79,
      stripeCouponEnv: "STRIPE_COUPON_BASIC_LAUNCH"
    });
    expect(basic && isPlanPurchasable(basic)).toBe(true);
  });

  it("does not assign prices to inactive plans", () => {
    expect(
      plans
        .filter((plan) => plan.commercialStatus === "inactive")
        .every((plan) => plan.monthlyPriceSek === null)
    ).toBe(true);
  });
});
