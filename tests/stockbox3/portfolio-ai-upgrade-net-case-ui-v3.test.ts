import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const coach = readFileSync("src/components/portfolio/portfolio-ai-coach.tsx", "utf8");

describe("Portfolio AI upgrade net-case UI V3", () => {
  it("surfaces a transparent net-case label from grounded upgrade evidence", () => {
    expect(coach).toContain("classifyPortfolioUpgradeNetCase");
    expect(coach).toContain("upgradeNetCaseByTicker");
    expect(coach).toContain("Netto-case");
    expect(coach).toContain("Net case");
    expect(coach).toContain("Stark förbättring");
    expect(coach).toContain("Strong improvement");
    expect(coach).toContain("Blandad");
    expect(coach).toContain("Mixed");
    expect(coach).toContain("Marginell");
    expect(coach).toContain("Marginal");
    expect(coach).toContain("Otillräckligt underlag");
    expect(coach).toContain("Insufficient evidence");
  });

  it("states that the net case is evidence balance rather than a return forecast", () => {
    expect(coach).toContain("evidensbalans");
    expect(coach).toContain("evidence balance");
    expect(coach).toContain("inte en prognos");
    expect(coach).toContain("not a forecast");
    expect(coach).not.toContain("expectedReturn");
  });
});
