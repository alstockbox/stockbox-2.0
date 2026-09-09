import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("portfolio cash-flow UI", () => {
  it("offers dividend and security-fee entry on each active position", () => {
    const component = source("src/components/portfolio/portfolio-cash-flow-form.tsx");
    const page = source("src/app/portfolio/page.tsx");

    expect(component).toContain("recordPortfolioDividendAction");
    expect(component).toContain("recordPortfolioFeeAction");
    expect(component).toContain('name="portfolioId"');
    expect(component).toContain('name="ticker"');
    expect(component).toContain('name="currency"');
    expect(component).toContain('name="amount"');
    expect(component).toContain('name="transactionDate"');
    expect(component).toContain("Registrera utdelning");
    expect(component).toContain("Registrera avgift");

    expect(page).toContain('import { PortfolioCashFlowForm } from "@/components/portfolio/portfolio-cash-flow-form"');
    expect(page).toContain("<PortfolioCashFlowForm");
    expect(page).toContain("portfolioId={portfolio.id}");
    expect(page).toContain("ticker={position.ticker}");
    expect(page).toContain("currency={position.currency}");
  });

  it("lets dividend and fee history rows correct amount, currency and date", () => {
    const page = source("src/app/portfolio/page.tsx");
    const historyRow = source("src/components/portfolio/portfolio-cash-flow-history-row.tsx");

    expect(page).toContain('import { PortfolioCashFlowHistoryRow } from "@/components/portfolio/portfolio-cash-flow-history-row"');
    expect(page).toContain("<PortfolioCashFlowHistoryRow");
    expect(page).toContain("cashAmount={transaction.cash_amount}");
    expect(page).toContain("executedAt={transaction.executed_at}");

    expect(historyRow).toContain("updatePortfolioCashFlowTransactionAction");
    expect(historyRow).toContain('name="amount"');
    expect(historyRow).toContain('name="transactionDate"');
    expect(historyRow).toContain('name="currency"');
    expect(historyRow).toContain("Spara kassaflöde");
    expect(historyRow).toContain("Save cash flow");
  });

  it("reads and displays persisted realized, dividend, fee and total P/L metrics", () => {
    const page = source("src/app/portfolio/page.tsx");

    for (const field of [
      "realized_pl",
      "dividend_income",
      "standalone_fees",
      "trading_fees",
      "total_fees",
      "total_pl",
    ]) {
      expect(page).toContain(field);
    }

    expect(page).toContain("Realiserat P/L");
    expect(page).toContain("Orealiserat P/L");
    expect(page).toContain("Utdelningar");
    expect(page).toContain("Avgifter");
    expect(page).toContain("Totalt P/L");
    expect(page).not.toContain("Total avkastning %");
  });
});
