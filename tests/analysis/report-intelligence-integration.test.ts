import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("analysis report intelligence integration", () => {
  it("renders Opportunity Intelligence from the active lens in the Pro report flow", () => {
    const source = readFileSync("src/components/analysis/research-question-panel.tsx", "utf8");

    expect(source).toContain("buildIntelligenceSnapshot");
    expect(source).toContain("OpportunityIntelligencePanel");
    expect(source).toContain("buildIntelligenceSnapshot(report, report.investmentProfile)");
    expect(source).toContain("snapshot={intelligence}");
  });
});
