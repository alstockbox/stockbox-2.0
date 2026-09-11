import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchOfficialInvestmentCompanyHoldings,
  parseIndustrivardenOfficialHoldings,
} from "../../src/lib/data/official-investment-company-holdings";

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

describe("official investment-company holdings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses Industrivärden's complete official portfolio and normalizes only the explicit rounding surplus", () => {
    const parsed = parseIndustrivardenOfficialHoldings(COMPLETE_HTML);

    expect(parsed).not.toBeNull();
    expect(parsed?.asOf).toBe("2026-06-30");
    expect(parsed?.rawWeightSum).toBeCloseTo(1.01, 12);
    expect(parsed?.holdings).toHaveLength(8);
    expect(parsed?.holdings.reduce((sum, holding) => sum + holding.weight, 0)).toBeCloseTo(1, 12);
    expect(parsed?.holdings.find((holding) => holding.name === "Sandvik")?.weight).toBeCloseTo(0.33 / 1.01, 12);
    expect(parsed?.holdings.every((holding) => holding.reportedWeight > 0)).toBe(true);
  });

  it("fails closed when the official table does not represent at least 95% of portfolio weight", () => {
    const incomplete = COMPLETE_HTML
      .replace("<tr><td>15 %</td><td>Handelsbanken</td></tr>", "")
      .replace("<tr><td>10 %</td><td>Essity</td></tr>", "");

    expect(parseIndustrivardenOfficialHoldings(incomplete)).toBeNull();
  });

  it("fetches the Industrivärden official portfolio with auditable provenance", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      text: async () => COMPLETE_HTML,
    }));

    const result = await fetchOfficialInvestmentCompanyHoldings({
      ticker: "INDU-C.ST",
      name: "AB Industrivärden",
      securityType: "Common Stock",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.holdings).toHaveLength(8);
    expect(result.data.asOf).toBe("2026-06-30");
    expect(result.data.source.provider).toBe("official-investment-company-holdings");
    expect(result.data.source.url).toContain("industrivarden.se");
    expect(result.data.diagnostic.status).toBe("available");
  });

  it("does not pretend an unsupported investment company has official holdings coverage", async () => {
    const result = await fetchOfficialInvestmentCompanyHoldings({
      ticker: "UNKNOWN.ST",
      name: "Unknown Investment AB",
      securityType: "Common Stock",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.status).toBe("unavailable");
    expect(result.diagnostic.reason).toBe("official_holdings_adapter_not_configured");
  });
});
