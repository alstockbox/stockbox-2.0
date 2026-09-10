import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const coach = readFileSync("src/components/portfolio/portfolio-ai-coach.tsx", "utf8");
const route = readFileSync("src/app/portfolio/ai/page.tsx", "utf8");
const analyzer = readFileSync("src/components/portfolio/portfolio-analyzer.tsx", "utf8");

describe("Portfolio AI main release surface", () => {
  it("reads only snapshots matching the current ledger revision", () => {
    expect(route).toContain('from("portfolio_ledger_revisions")');
    expect(route).toContain('from("portfolio_snapshots")');
    expect(route).toContain("numeric(snapshot.ledger_revision) === currentRevision");
    expect(route).toContain("const latest = currentSnapshots[0] ?? null");
    expect(route).toContain("const previous = currentSnapshots[1] ?? null");
  });

  it("keeps the AI surface decision-support only", () => {
    expect(route).toContain("No orders are placed");
    expect(route).toContain("what-if is not a return forecast");
    expect(coach).toContain("simulatePortfolioWhatIf");
    expect(coach).toContain("rankPortfolioUpgradeOptions");
    expect(coach).toContain("summarizePortfolioUpgradeEvidence");
    expect(coach).not.toContain("record_portfolio_transaction");
    expect(coach).not.toContain("addHoldingAction");
    expect(coach).not.toContain("sellHoldingAction");
  });

  it("requires authenticated user context and preserves fail-closed empty-snapshot handling", () => {
    expect(route).toContain("getCurrentUser()");
    expect(route).toContain("/auth/login?next=/portfolio/ai");
    expect(route).toContain("if (!latest)");
    expect(route).toContain("current ledger revision");
  });

  it("links the existing Portfolio 2 analyzer to the isolated AI route for the selected portfolio", () => {
    expect(analyzer).toContain("/portfolio/ai?portfolioId=");
    expect(analyzer).toContain("encodeURIComponent(portfolioId)");
    expect(analyzer).toContain("Öppna Portfolio AI");
  });
});
