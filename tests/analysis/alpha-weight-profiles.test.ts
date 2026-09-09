import { describe, expect, it } from "vitest";
import { getAlphaWeightProfile } from "../../src/lib/alpha/weights";

describe("Alpha archetype weight profiles", () => {
  it("normalizes every profile to one", () => {
    for (const archetype of ["standard", "software_growth", "bank", "cyclical", "pre_revenue_biotech", "unknown"]) {
      const profile = getAlphaWeightProfile(archetype);
      const total = Object.values(profile.weights).reduce((sum, value) => sum + value, 0);
      expect(total).toBeCloseTo(1, 10);
    }
  });

  it("does not score software growth and banks with the same signal mix", () => {
    const software = getAlphaWeightProfile("software_growth");
    const bank = getAlphaWeightProfile("bank");

    expect(software.weights.growthAcceleration).toBeGreaterThan(bank.weights.growthAcceleration);
    expect(bank.weights.quality).toBeGreaterThan(software.weights.quality);
    expect(bank.support).toBeLessThan(software.support);
  });

  it("reduces confidence for archetypes whose specialized alpha model is not yet fully supported", () => {
    expect(getAlphaWeightProfile("pre_revenue_biotech").support).toBeLessThan(0.6);
    expect(getAlphaWeightProfile("standard").support).toBe(1);
  });
});
