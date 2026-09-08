import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const coach = readFileSync("src/components/portfolio/portfolio-ai-coach.tsx", "utf8");

describe("Portfolio AI upgrade evidence UI V3", () => {
  it("explains why an analyzed upgrade fits better using planner-derived dimension drivers", () => {
    expect(coach).toContain("buildPortfolioUpgradeDrivers");
    expect(coach).toContain("upgradeDriversByTicker");
    expect(coach).toContain("Varför bättre?");
    expect(coach).toContain("Why better?");
    expect(coach).toContain("driver.improvement");
    expect(coach).toContain("driver.dimension");
  });

  it("keeps the comparison informational and does not add trading actions", () => {
    expect(coach).toContain("Jämförelse, inte order");
    expect(coach).not.toContain("sellHoldingAction");
    expect(coach).not.toContain("record_portfolio_transaction");
  });
});
