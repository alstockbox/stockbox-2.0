import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OpportunityIntelligencePanel } from "@/components/analysis/opportunity-intelligence-panel";
import type { IntelligenceSnapshot } from "@/lib/analysis/intelligence-snapshot";

const snapshot: IntelligenceSnapshot = {
  canonicalCoreScore: 77,
  lensCoreScore: 81,
  mispricing: {
    score: 74,
    confidence: 82,
    coverage: 0.8,
    label: "discounted",
    pillars: [],
    valueTrapRisk: "low",
    positiveEvidence: ["Attractive historical valuation"],
    counterEvidence: [],
    dataAsOf: "2026-08-31",
  },
  inflection: {
    score: 83,
    confidence: 78,
    coverage: 0.8,
    stage: "confirming",
    signals: [],
    accelerators: ["Fundamental acceleration"],
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

describe("OpportunityIntelligencePanel", () => {
  it("renders separate core, mispricing, inflection and opportunity views", () => {
    const html = renderToStaticMarkup(<OpportunityIntelligencePanel snapshot={snapshot} locale="en" />);

    expect(html).toContain("Opportunity Intelligence");
    expect(html).toContain("Core quality");
    expect(html).toContain("Mispricing");
    expect(html).toContain("Inflection / early acceleration");
    expect(html).toContain("80/100");
    expect(html).toContain("Coverage");
  });

  it("renders warnings prominently when the setup is risky", () => {
    const risky: IntelligenceSnapshot = {
      ...snapshot,
      mispricing: { ...snapshot.mispricing, valueTrapRisk: "high" },
      inflection: { ...snapshot.inflection, stage: "extended", overextensionRisk: "high" },
    };
    const html = renderToStaticMarkup(<OpportunityIntelligencePanel snapshot={risky} locale="sv" />);

    expect(html).toMatch(/value-trap/i);
    expect(html).toMatch(/översträckt/i);
    expect(html).toMatch(/inte en prognos/i);
  });
});
