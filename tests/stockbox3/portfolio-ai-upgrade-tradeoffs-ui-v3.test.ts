import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const coach = readFileSync("src/components/portfolio/portfolio-ai-coach.tsx", "utf8");

describe("Portfolio AI balanced upgrade evidence UI V3", () => {
  it("shows grounded strengths and tradeoffs for analyzed alternatives", () => {
    expect(coach).toContain("comparePortfolioUpgradeEvidence");
    expect(coach).toContain("upgradeEvidenceByTicker");
    expect(coach).toContain("Starkare på");
    expect(coach).toContain("Stronger on");
    expect(coach).toContain("Svagare på");
    expect(coach).toContain("Weaker on");
    expect(coach).toContain("item.delta");
    expect(coach).toContain("item.dimension");
  });

  it("keeps the comparison non-transactional", () => {
    expect(coach).toContain("Jämförelse, inte order");
    expect(coach).not.toContain("sellHoldingAction");
    expect(coach).not.toContain("record_portfolio_transaction");
  });
});
