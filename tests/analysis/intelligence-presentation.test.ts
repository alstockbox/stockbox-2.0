import { describe, expect, it } from "vitest";
import { buildIntelligencePresentation } from "@/lib/analysis/intelligence-presentation";
import type { IntelligenceSnapshot } from "@/lib/analysis/intelligence-snapshot";

const snapshot: IntelligenceSnapshot = {
  canonicalCoreScore: 78,
  lensCoreScore: 82,
  mispricing: {
    score: 76,
    confidence: 84,
    coverage: 0.8,
    label: "discounted",
    valueTrapRisk: "low",
    pillars: [],
    positiveEvidence: ["Historical valuation is attractive."],
    counterEvidence: [],
    dataAsOf: "2026-08-31",
  },
  inflection: {
    score: 81,
    confidence: 79,
    coverage: 0.8,
    stage: "confirming",
    signals: [],
    accelerators: ["Fundamental acceleration is positive."],
    brakes: [],
    overextensionRisk: "low",
    availableFamilies: ["fundamental", "market", "funding"],
    dataAsOf: "2026-08-31",
  },
  opportunity: {
    score: 80,
    coverage: 1,
    label: "attractive",
    profile: "growth",
    components: [],
  },
};

describe("buildIntelligencePresentation", () => {
  it("explains the four scores in plain Swedish without implying certainty", () => {
    const result = buildIntelligencePresentation(snapshot, "sv");

    expect(result.title).toMatch(/möjlighet/i);
    expect(result.cards.map((card) => card.id)).toEqual(["core", "mispricing", "inflection", "opportunity"]);
    expect(result.cards.find((card) => card.id === "mispricing")?.detail).toMatch(/rabatt|värder/i);
    expect(result.cards.find((card) => card.id === "inflection")?.detail).toMatch(/bekräft/i);
    expect(result.disclaimer).toMatch(/inte.*prognos|ingen.*garanti/i);
  });

  it("surfaces value-trap and overextension warnings instead of hiding them", () => {
    const risky: IntelligenceSnapshot = {
      ...snapshot,
      mispricing: { ...snapshot.mispricing, valueTrapRisk: "high", counterEvidence: ["Margins deteriorating"] },
      inflection: { ...snapshot.inflection, stage: "extended", overextensionRisk: "high", brakes: ["Price action appears overextended"] },
    };
    const result = buildIntelligencePresentation(risky, "en");

    expect(result.warnings.join(" ")).toMatch(/value trap/i);
    expect(result.warnings.join(" ")).toMatch(/overextended|extension/i);
  });

  it("shows missing scores as unavailable rather than zero", () => {
    const missing: IntelligenceSnapshot = {
      ...snapshot,
      mispricing: { ...snapshot.mispricing, score: null, label: "uncertain" },
    };
    const result = buildIntelligencePresentation(missing, "en");

    expect(result.cards.find((card) => card.id === "mispricing")?.score).toBeNull();
    expect(result.cards.find((card) => card.id === "mispricing")?.status).toMatch(/unavailable|uncertain/i);
  });
});
