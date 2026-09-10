import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const coachPath = path.join(process.cwd(), "src/components/portfolio/portfolio-ai-coach.tsx");
const coachSource = fs.readFileSync(coachPath, "utf8");

describe("Portfolio AI ranked upgrade decision UI", () => {
  it("renders ranked upgrade candidates and marks only a grounded top option as best match", () => {
    expect(coachSource).toContain("rankPortfolioUpgradeOptions");
    expect(coachSource).toContain("rankedUpgradeCandidates");
    expect(coachSource).toContain("rankedUpgradeCandidates.map");
    expect(coachSource).toContain("Bäst match");
    expect(coachSource).toContain("Best match");
    expect(coachSource).toContain('netCase.label !== "insufficient"');
  });

  it("shows a concise two-sided evidence summary without turning comparison into a forecast or order", () => {
    expect(coachSource).toContain("summarizePortfolioUpgradeEvidence");
    expect(coachSource).toContain("Starkast på");
    expect(coachSource).toContain("Strongest on");
    expect(coachSource).toContain("men svagare på");
    expect(coachSource).toContain("but weaker on");
    expect(coachSource).toContain("Jämförelse, inte order");
    expect(coachSource).toContain("not a forecast");
    expect(coachSource).not.toContain("sellHoldingAction");
    expect(coachSource).not.toContain("record_portfolio_transaction");
  });
});
