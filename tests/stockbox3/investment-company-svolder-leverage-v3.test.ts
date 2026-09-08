import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSvolderOfficialHoldings } from "../../src/lib/data/official-investment-company-holdings";

const provider = readFileSync("src/lib/data/universal-security-provider.ts", "utf8");

function svolderHtml(summary: string, value: string, weight: string): string {
  return `
    <html><body>
      <p>Svolders innehav per 2026-06-30</p>
      <p>${summary}</p>
      <h3>Alpha AB</h3><p>100,00 ${value} ${weight}</p>
      <h3>Beta AB</h3><p>100,00 ${value} ${weight}</p>
      <h3>Gamma AB</h3><p>100,00 ${value} ${weight}</p>
      <h3>Delta AB</h3><p>100,00 ${value} ${weight}</p>
      <h3>Epsilon AB</h3><p>100,00 ${value} ${weight}</p>
    </body></html>`;
}

describe("StockBox 3 Svolder issuer-level leverage authority", () => {
  it("maps a reconciled positive net receivable to zero holding-company net leverage", () => {
    const parsed = parseSvolderOfficialHoldings(svolderHtml(
      "Aktieportföljen 1000 95 Nettofordran(+)/nettoskuld(-) 50 5 Totalt/Substansvärde 1050 100",
      "200",
      "19",
    ));

    expect(parsed).not.toBeNull();
    expect(parsed?.holdingCompanyLeverageRatio).toBe(0);
    expect(parsed?.rawWeightSum).toBeCloseTo(1, 12);
    expect(parsed?.holdings.reduce((sum, holding) => sum + holding.weight, 0)).toBeCloseTo(1, 12);
  });

  it("derives net debt over the verified equity portfolio and keeps liabilities out of holdings HHI", () => {
    const parsed = parseSvolderOfficialHoldings(svolderHtml(
      "Aktieportföljen 1020 102 Nettofordran(+)/nettoskuld(-) -20 -2 Totalt/Substansvärde 1000 100",
      "204",
      "20.4",
    ));

    expect(parsed).not.toBeNull();
    expect(parsed?.holdingCompanyLeverageRatio).toBeCloseTo(20 / 1020, 12);
    expect(parsed?.rawWeightSum).toBeCloseTo(1.02, 12);
    expect(parsed?.holdings).toHaveLength(5);
    expect(parsed?.holdings.some((holding) => holding.issuerFundamentalsEligible === false)).toBe(false);
    expect(parsed?.holdings.reduce((sum, holding) => sum + holding.weight, 0)).toBeCloseTo(1, 12);
  });

  it("fails closed when the published financing bridge does not reconcile to NAV", () => {
    expect(parseSvolderOfficialHoldings(svolderHtml(
      "Aktieportföljen 1020 102 Nettofordran(+)/nettoskuld(-) -50 -5 Totalt/Substansvärde 1000 100",
      "204",
      "20.4",
    ))).toBeNull();
  });

  it("wires the holdings-derived ratio only behind the existing disclosure freshness gate", () => {
    expect(provider).toContain("const holdingsLeverageRatio = holdingsComparable && officialHoldings.ok");
    expect(provider).toContain("officialHoldings.data.holdingCompanyLeverageRatio");
    expect(provider).toContain("annualLeverageRatio ?? dedicatedLeverageRatio ?? holdingsLeverageRatio");
  });
});
