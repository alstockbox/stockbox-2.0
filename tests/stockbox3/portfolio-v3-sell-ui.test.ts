import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/portfolio/page.tsx", "utf8");
const actions = readFileSync("src/lib/workspace/actions.ts", "utf8");

describe("Portfolio V3 sale and realized P/L UI", () => {
  it("exposes sales through the guarded server action", () => {
    expect(page).toContain("sellHoldingAction");
    expect(page).toContain("<form action={sellHoldingAction}");
    expect(page).toContain('name="salePrice"');
    expect(page).toContain('name="saleDate"');
    expect(page).toContain('name="quantity"');
    expect(page).toContain('name="currency"');
    expect(page).toContain('name="fees"');
    expect(actions).toContain('p_transaction_type: "sell"');
    expect(actions).toContain('rpc("record_portfolio_transaction"');
  });

  it("shows a specific oversell error instead of silently clamping the sale", () => {
    expect(page).toContain('params.error === "transaction_sell_quantity"');
    expect(page).toContain("Försäljningen är större än det tillgängliga innehavet");
    expect(page).toContain("The sale is larger than the available position");
    expect(actions).toContain('redirect("/portfolio?error=transaction_sell_quantity")');
  });

  it("derives realized P/L from the transaction ledger", () => {
    expect(page).toContain("calculateRealizedPortfolioPerformance(transactionInputs)");
    expect(page).toContain("realizedPerformance.complete");
    expect(page).toContain("realizedPerformance.byCurrency.map");
  });

  it("never presents a synthetic cross-currency realized total", () => {
    expect(page).toContain("Visas separat per transaktionsvaluta");
    expect(page).toContain("StockBox blandar inte valutor utan verifierad FX");
    expect(page).toContain("Shown separately by transaction currency");
    expect(page).toContain("StockBox does not mix currencies without verified FX");
    expect(page).not.toContain("totalRealizedProfitLoss");

    const realizedStart = page.indexOf("realizedPerformance.complete");
    const analyzerStart = page.indexOf("<PortfolioAnalyzer", realizedStart);
    expect(realizedStart).toBeGreaterThan(-1);
    expect(analyzerStart).toBeGreaterThan(realizedStart);
    const realizedSection = page.slice(realizedStart, analyzerStart);
    expect(realizedSection).toContain("realizedPerformance.byCurrency.map");
    expect(realizedSection).not.toContain("realizedProfitLossBase");
    expect(realizedSection).not.toContain(".reduce(");
  });

  it("fails closed in the UI when ledger integrity is not complete", () => {
    expect(page).toContain("!realizedPerformance.complete");
    expect(page).toContain("StockBox fyller inte i ett delresultat");
    expect(page).toContain("StockBox does not fill in a partial result");
  });

  it("does not reintroduce direct derived-holding mutations", () => {
    const relevant = `${page}\n${actions}`;
    expect(relevant).not.toContain('.from("holdings").update(');
    expect(relevant).not.toContain('.from("holdings").delete(');
  });
});
