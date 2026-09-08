import { describe, expect, it } from "vitest";
import {
  parseIndustrivardenOfficialKeyRatios,
  selectVerifiedAnnualLeverageRatio,
} from "@/lib/data/official-investment-company-key-ratios";
import fs from "node:fs";
import path from "node:path";

const providerPath = path.join(process.cwd(), "src/lib/data/universal-security-provider.ts");

function tableHtml(): string {
  return `
    <table>
      <tr><th>2025</th><th>2024</th><th>2023</th><th>2022</th><th>2021</th></tr>
      <tr><td>Equities portfolio</td></tr>
      <tr><td>Total return, %</td><td>12.0</td><td>10.0</td><td>8.0</td><td>6.0</td><td>4.0</td></tr>
      <tr><td>Total return index (SIXRX), %</td><td>11.0</td><td>9.0</td><td>7.0</td><td>5.0</td><td>3.0</td></tr>
      <tr><td>Net purchases/sales, SEK m</td><td>100</td><td>90</td><td>80</td><td>70</td><td>60</td></tr>
      <tr><td>Net debt</td></tr>
      <tr><td>Value, SEK m</td><td>12,000</td><td>11,000</td><td>10,000</td><td>9,000</td><td>8,000</td></tr>
      <tr><td>Debt-equities ratio, %</td><td>8.2</td><td>7.9</td><td>7.5</td><td>7.0</td><td>6.5</td></tr>
      <tr><td>Net asset value</td></tr>
      <tr><td>Per share, SEK</td><td>420</td><td>390</td><td>360</td><td>330</td><td>300</td></tr>
      <tr><td>Number of shares outstanding</td></tr>
      <tr><td>Total, thousands</td><td>432000</td><td>432000</td><td>432000</td><td>432000</td><td>432000</td></tr>
      <tr><td>Dividends paid</td></tr>
      <tr><td>Value, SEK m</td><td>3400</td><td>3200</td><td>3000</td><td>2800</td><td>2600</td></tr>
      <tr><td>Value per share, SEK</td><td>7.75</td><td>7.25</td><td>6.75</td><td>6.25</td><td>5.75</td></tr>
      <tr><td>Other key ratios</td></tr>
      <tr><td>Dividends received, SEK m</td><td>5100</td><td>4800</td><td>4500</td><td>4200</td><td>3900</td></tr>
    </table>
  `;
}

describe("Industrivärden official leverage V3", () => {
  it("parses issuer-published debt-equities ratios as explicit ratios", () => {
    const parsed = parseIndustrivardenOfficialKeyRatios(tableHtml());
    expect(parsed?.years[0]).toMatchObject({ year: 2025, debtEquitiesRatio: 0.082 });
    expect(parsed?.years).toHaveLength(5);
  });

  it("selects the latest verified annual ratio not later than the market year", () => {
    expect(selectVerifiedAnnualLeverageRatio([
      { year: 2026, debtEquitiesRatio: 0.09 },
      { year: 2025, debtEquitiesRatio: 0.082 },
      { year: 2024, debtEquitiesRatio: 0.079 },
    ], 2025)).toBe(0.082);
  });

  it("allows at most one annual year of lag and otherwise fails closed", () => {
    expect(selectVerifiedAnnualLeverageRatio([{ year: 2024, debtEquitiesRatio: 0.079 }], 2025)).toBe(0.079);
    expect(selectVerifiedAnnualLeverageRatio([{ year: 2023, debtEquitiesRatio: 0.075 }], 2025)).toBeNull();
  });

  it("rejects invalid issuer ratios", () => {
    expect(selectVerifiedAnnualLeverageRatio([{ year: 2025, debtEquitiesRatio: -0.01 }], 2025)).toBeNull();
    expect(selectVerifiedAnnualLeverageRatio([{ year: 2025, debtEquitiesRatio: 1 }], 2025)).toBeNull();
    expect(selectVerifiedAnnualLeverageRatio([{ year: 2025, debtEquitiesRatio: Number.NaN }], 2025)).toBeNull();
  });

  it("wires official key-ratio leverage before the Latour-only fallback without generic debt", () => {
    const source = fs.readFileSync(providerPath, "utf8");
    expect(source).toContain('fetchOfficialInvestmentCompanyKeyRatios');
    expect(source).toContain('selectVerifiedAnnualLeverageRatio');
    expect(source).toContain('officialKeyRatios');
    expect(source).toContain('holdingCompanyLeverageRatio: verifiedLeverageRatio');
    expect(source).not.toContain('holdingCompanyLeverageRatio: latest?.totalDebt');
  });
});
