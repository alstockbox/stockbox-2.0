import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("closed portfolio position UI", () => {
  it("keeps ledger history visible and exposes cash-flow entry points after positions are fully sold", () => {
    const page = source("src/app/portfolio/page.tsx");

    expect(page).toContain("closedCashFlowPositions");
    expect(page).toContain("positions.length || portfolioTransactions.length");
    expect(page).toContain("Stängda positioner");
    expect(page).toContain("Closed positions");
    expect(page).toContain("Inga aktiva positioner");
    expect(page).toContain("No active positions");
    expect(page).toContain("ticker={identity.ticker}");
    expect(page).toContain("currency={identity.currency}");
  });
});
