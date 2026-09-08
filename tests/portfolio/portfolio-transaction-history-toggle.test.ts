import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("portfolio transaction history toggle", () => {
  it("keeps 30 rows compact by default and exposes all rows on demand", () => {
    const page = source("src/app/portfolio/page.tsx");

    expect(page).toContain("showAllTransactions");
    expect(page).toContain('params.transactions === "all"');
    expect(page).toContain("portfolioTransactions.slice(0, showAllTransactions ? portfolioTransactions.length : 30)");
    expect(page).toContain("portfolioTransactions.length > 30");
    expect(page).toContain("transactions=all");
    expect(page).toContain("Visa alla");
    expect(page).toContain("Visa färre");
    expect(page).toContain("Show all");
    expect(page).toContain("Show fewer");
    expect(page).not.toContain("portfolioTransactions.slice(0, 30).map");
  });
});
