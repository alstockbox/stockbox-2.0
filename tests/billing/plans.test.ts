import { describe, expect, it } from "vitest";
import { commerciallyActivePlans, findPlan, isPlanPurchasable, plans } from "../../src/lib/billing/plans";

describe("billing plan catalog", () => {
  it("exposes the approved five-tier commercial ladder", () => {
    expect(commerciallyActivePlans.map((plan) => plan.key)).toEqual(["free", "basic", "standard", "premium", "elite"]);
    expect(commerciallyActivePlans.map((plan) => plan.name)).toEqual(["Free", "Basic", "Standard", "Pro", "Elite"]);
  });

  it.each([
    ["basic", 69, 10], ["standard", 119, 35], ["premium", 179, 70], ["elite", 399, 350]
  ] as const)("makes %s purchasable at the approved regular price", (key, price, analyses) => {
    const plan = findPlan(key)!;
    expect(plan.monthlyPriceSek).toBe(price);
    expect(plan.entitlements.monthlyAnalyses).toBe(analyses);
    expect(isPlanPurchasable(plan)).toBe(true);
  });

  it("models all approved launch offers", () => {
    expect(findPlan("basic")?.launchOffer).toMatchObject({ monthlyPriceSek: 49, durationMonths: 3, thenMonthlyPriceSek: 69 });
    expect(findPlan("standard")?.launchOffer).toMatchObject({ monthlyPriceSek: 79, durationMonths: 3, thenMonthlyPriceSek: 119 });
    expect(findPlan("premium")?.launchOffer).toMatchObject({ monthlyPriceSek: 159, durationMonths: 3, thenMonthlyPriceSek: 179 });
    expect(findPlan("elite")?.launchOffer).toBeUndefined();
  });

  it("keeps Free recurring quota at three analyses and Standard highlighted", () => {
    expect(findPlan("free")?.entitlements.monthlyAnalyses).toBe(3);
    expect(findPlan("standard")?.highlight).toBe(true);
    expect(plans.filter((plan) => plan.highlight).map((plan) => plan.key)).toEqual(["standard"]);
  });
});
