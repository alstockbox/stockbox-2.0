import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const coach = readFileSync("src/components/portfolio/portfolio-ai-coach.tsx", "utf8");
const page = readFileSync("src/app/portfolio/page.tsx", "utf8");

describe("Portfolio AI coach V3 interaction surface", () => {
  it("uses the tested portfolio planner instead of duplicating allocation math in the React component", () => {
    expect(coach).toContain('from "@/lib/portfolio/portfolio-ai-planner"');
    expect(coach).toContain("createPortfolioPlan");
    expect(coach).toContain("buildPortfolioActionPlan");
    expect(coach).toContain("buildRebalancePlan");
    expect(coach).not.toContain("function buildWeights(");
    expect(coach).not.toContain("const recommendationAdjustment");
  });

  it("lets the user define investable budget and cash reserve", () => {
    expect(coach).toContain("Investeringsbelopp");
    expect(coach).toContain("Investment amount");
    expect(coach).toContain("Kassareserv");
    expect(coach).toContain("Cash reserve");
    expect(coach).toContain("cashReservePercent");
    expect(coach).toContain("plan.cashReserveAmount");
    expect(coach).toContain("plan.investableAmount");
  });

  it("shows a grounded model allocation in both percent and budget amount", () => {
    expect(coach).toContain("targetPortfolioWeight");
    expect(coach).toContain("targetAmount");
    expect(coach).toContain("formatMoney");
    expect(coach).toContain("plan.dataQuality");
    expect(coach).toContain("recommendedAdditionalAnalyses");
    expect(coach).toContain("staleTickers");
  });

  it("turns portfolio diagnostics into a prioritized action plan", () => {
    expect(coach).toContain("actionPlan.slice(0, 6)");
    expect(coach).toContain("negative_signal");
    expect(coach).toContain("concentration");
    expect(coach).toContain("weak_holding");
    expect(coach).toContain("stale_data");
    expect(coach).toContain("Prioritet");
    expect(coach).toContain("Priority");
  });

  it("shows snapshot changes and target-vs-current rebalance deltas without creating orders", () => {
    expect(coach).toContain("Vad har förändrats?");
    expect(coach).toContain("What changed?");
    expect(coach).toContain("snapshotDelta");
    expect(coach).toContain("Nuvarande");
    expect(coach).toContain("Current");
    expect(coach).toContain("Målvikt");
    expect(coach).toContain("Target weight");
    expect(coach).toContain("deltaWeight");
    expect(coach).not.toContain("sellHoldingAction");
    expect(coach).not.toContain("addHoldingAction");
    expect(coach).not.toContain("record_portfolio_transaction");
  });

  it("passes freshness and previous-snapshot context from the portfolio page", () => {
    expect(page).toContain("analyzedAt: latest?.created_at ?? null");
    expect(page).toContain("const previous = history[1] ?? null");
    expect(page).toContain("snapshotDelta: comparePortfolioSnapshots(");
    expect(page).toContain("baseCurrency: state.portfolio.base_currency");
    expect(page).toContain("portfolioValue: numeric(state.latest?.portfolio_value)");
    expect(page).toContain("asOf={aiAsOf}");
  });
});
