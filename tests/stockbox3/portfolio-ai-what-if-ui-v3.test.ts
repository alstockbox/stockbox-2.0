import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const coach = fs.readFileSync(path.join(process.cwd(), "src/components/portfolio/portfolio-ai-coach.tsx"), "utf8");

describe("Portfolio AI what-if UI V3", () => {
  it("surfaces a current-vs-draft structural simulation with explicit data-quality guardrails", () => {
    expect(coach).toContain("simulatePortfolioWhatIf");
    expect(coach).toContain("whatIfSimulation");
    expect(coach).toContain("What-if: om jag följde detta utkast?");
    expect(coach).toContain("What-if: if I followed this draft?");
    expect(coach).toContain("Viktad StockBox-score");
    expect(coach).toContain("Weighted StockBox score");
    expect(coach).toContain("Viktdiversifiering");
    expect(coach).toContain("Weight diversification");
    expect(coach).toContain("Otillräckligt jämförbart analysunderlag");
    expect(coach).toContain("Insufficient comparable analysis coverage");
  });

  it("keeps what-if simulation informational and does not add transaction actions", () => {
    expect(coach).not.toContain("executeWhatIf");
    expect(coach).not.toContain("record_portfolio_transaction");
    expect(coach).not.toContain("whatIfBuyAction");
    expect(coach).not.toContain("whatIfSellAction");
  });
});
