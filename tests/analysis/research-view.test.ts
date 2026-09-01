import { describe, expect, it } from "vitest";
import { legacyRatingContext, overallResearchView } from "../../src/lib/analysis/research-view";

describe("neutral overall research view", () => {
  it("uses transparent score bands without directional advice labels", () => {
    expect(overallResearchView({ score: 82, confidence: 90, coverage: 0.9 })).toBe("Strong");
    expect(overallResearchView({ score: 66, confidence: 90, coverage: 0.9 })).toBe("Solid");
    expect(overallResearchView({ score: 50, confidence: 90, coverage: 0.9 })).toBe("Mixed");
    expect(overallResearchView({ score: 30, confidence: 90, coverage: 0.9 })).toBe("Weak");
  });

  it("fails closed when confidence or weighted coverage is insufficient", () => {
    expect(overallResearchView({ score: 90, confidence: 39, coverage: 0.9 })).toBe("Insufficient data");
    expect(overallResearchView({ score: 90, confidence: 90, coverage: 0.54 })).toBe("Insufficient data");
    expect(overallResearchView({ score: null, confidence: 90, coverage: 0.9 })).toBe("Insufficient data");
  });

  it("explains why a strong research view can coexist with legacy Hold", () => {
    const context = legacyRatingContext({
      view: "Strong",
      rating: "Hold",
      constraints: ["Buy requires positive valuation support."],
      locale: "en",
    });
    expect(context).toContain("price-and-valuation signal");
    expect(context).toContain("Buy requires positive valuation support.");
  });

  it("localizes the Hold explanation and does not add it to unrelated ratings", () => {
    const context = legacyRatingContext({
      view: "Strong",
      rating: "Hold",
      constraints: ["Buy requires positive valuation support."],
      locale: "sv",
    });
    expect(context).toContain("pris- och värderingssignal");
    expect(context).toContain("Buy kräver positivt värderingsstöd vid aktuell kurs.");
    expect(legacyRatingContext({ view: "Strong", rating: "Buy", locale: "sv" })).toBeNull();
    expect(legacyRatingContext({ view: "Insufficient data", rating: "Hold", locale: "sv" })).toBeNull();
  });
});
