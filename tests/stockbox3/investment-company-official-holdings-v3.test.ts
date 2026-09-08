import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseIndustrivardenOfficialHoldings,
} from "../../src/lib/data/official-investment-company-holdings";

const providerPath = path.join(process.cwd(), "src/lib/data/universal-security-provider.ts");
const holdingsPath = path.join(process.cwd(), "src/lib/data/official-investment-company-holdings.ts");

const COMPLETE_HTML = `
<html><body>
  <table>
    <tr><th>Andel %</th><th>Bolag</th></tr>
    <tr><td>29 %</td><td>Volvo</td></tr>
    <tr><td>33 %</td><td>Sandvik</td></tr>
    <tr><td>15 %</td><td>Handelsbanken</td></tr>
    <tr><td>10 %</td><td>Essity</td></tr>
    <tr><td>4 %</td><td>SCA</td></tr>
    <tr><td>4 %</td><td>Skanska</td></tr>
    <tr><td>4 %</td><td>Ericsson</td></tr>
    <tr><td>2 %</td><td>Alleima</td></tr>
  </table>
  <p>June 30, 2026</p>
</body></html>`;

describe("StockBox 3 official investment-company holdings authority", () => {
  it("accepts a dated official portfolio only when at least 95% of published weight is represented", () => {
    const parsed = parseIndustrivardenOfficialHoldings(COMPLETE_HTML);
    expect(parsed).not.toBeNull();
    expect(parsed?.asOf).toBe("2026-06-30");
    expect(parsed?.rawWeightSum).toBeCloseTo(1.01, 12);
    expect(parsed?.holdings.reduce((sum, holding) => sum + holding.weight, 0)).toBeCloseTo(1, 12);

    const incomplete = COMPLETE_HTML
      .replace("<tr><td>15 %</td><td>Handelsbanken</td></tr>", "")
      .replace("<tr><td>10 %</td><td>Essity</td></tr>", "");
    expect(parseIndustrivardenOfficialHoldings(incomplete)).toBeNull();
  });

  it("keeps official holdings fail-closed and wires only fresh comparable disclosures into the investment-company model", () => {
    const holdings = readFileSync(holdingsPath, "utf8");
    const provider = readFileSync(providerPath, "utf8");

    expect(holdings).toContain('const PROVIDER_ID = "official-investment-company-holdings"');
    expect(holdings).toContain("const MIN_REPRESENTED_WEIGHT = 0.95");
    expect(holdings).toContain('cache: "no-store"');
    expect(holdings).toContain("AbortController");
    expect(holdings).toContain("official_holdings_adapter_not_configured");
    expect(holdings).toContain("official_holdings_parse_failed");

    expect(provider).toContain('from "./official-investment-company-holdings"');
    expect(provider).toContain("fetchOfficialInvestmentCompanyHoldings(company)");
    expect(provider).toContain("const holdingsComparable");
    expect(provider).toContain("isOfficialDisclosureComparable(");
    expect(provider).toContain("officialHoldings.data.asOf");
    expect(provider).toContain("holdings: investmentHoldings");
    expect(provider).toContain("official_holdings_stale_or_unverifiable_for_market_comparison");

    expect(provider).not.toMatch(/holdings\s*:\s*report\.(?:metrics|engine|market)/);
  });
});