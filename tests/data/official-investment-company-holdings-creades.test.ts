import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchOfficialInvestmentCompanyHoldings } from "../../src/lib/data/official-investment-company-holdings";

const CREADES_HOLDINGS_URL = "https://www.creades.se/innehav/substansvarde/";

const COMPLETE_CREADES_HTML = `
<main>
  <aside><p>Unrelated site metric 37%</p></aside>
  <h1>Substansvärde per 2026-08-31</h1>
  <p>Creades substansvärde per 31 augusti uppgår till 96 kronor per aktie.</p>
  <table>
    <thead>
      <tr><th>Innehav</th><th>Antal aktier</th><th>Marknadsvärde (SEK mn)</th><th>Kr/Aktie</th><th>Andel %</th></tr>
    </thead>
    <tbody>
      <tr><th>Noterade tillgångar</th><td></td><td></td><td></td><td></td></tr>
      <tr><td>Avanza</td><td>15 907 000</td><td>6 406</td><td>47</td><td>49</td></tr>
      <tr><td>Silex</td><td>11 086 990</td><td>1 965</td><td>14</td><td>15</td></tr>
      <tr><td>Apotea</td><td>1 250 000</td><td>97</td><td>1</td><td>1</td></tr>
      <tr><td>Seafire</td><td>12 990 001</td><td>96</td><td>1</td><td>1</td></tr>
      <tr><td>Klarna</td><td>522 696</td><td>74</td><td>1</td><td>1</td></tr>
      <tr><td>Aktiv förvaltning i kapitalförsäkring<sup>1</sup></td><td></td><td>2 251</td><td>17</td><td>17</td></tr>
      <tr><th>Onoterade tillgångar</th><td></td><td></td><td></td><td></td></tr>
      <tr><td>StickerApp</td><td></td><td>555</td><td>4</td><td>4</td></tr>
      <tr><td>Instabee</td><td></td><td>338</td><td>2</td><td>3</td></tr>
      <tr><td>Inet</td><td></td><td>319</td><td>2</td><td>2</td></tr>
      <tr><td>Lumene</td><td></td><td>258</td><td>2</td><td>2</td></tr>
      <tr><td>Mentimeter</td><td></td><td>145</td><td>1</td><td>1</td></tr>
      <tr><td>Röhnisch</td><td></td><td>125</td><td>1</td><td>1</td></tr>
      <tr><td>Findity</td><td></td><td>119</td><td>1</td><td>1</td></tr>
      <tr><td>Nordic Knots</td><td></td><td>105</td><td>1</td><td>1</td></tr>
      <tr><td>Kreditz</td><td></td><td>29</td><td></td><td></td></tr>
      <tr><td>Övriga onoterade värdepapper</td><td></td><td>159</td><td>1</td><td>1</td></tr>
      <tr><td>Övriga tillgångar och skulder netto<sup>2</sup></td><td></td><td>-15</td><td></td><td></td></tr>
      <tr><th>Totalt</th><td></td><td>13 027</td><td>96</td><td>100</td></tr>
    </tbody>
  </table>
  <p><sup>1</sup> De tre största innehaven är Sdiptech, Cynca Nordic och Exsitec. I kapitalförsäkringen finns även oinvesterade medel.</p>
</main>
`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("official Creades holdings", () => {
  it("uses the complete explicitly weighted official NAV table without inventing weights for blank rows", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(COMPLETE_CREADES_HTML, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOfficialInvestmentCompanyHoldings({
      ticker: "CRED-A.ST",
      name: "Creades AB",
      securityType: "Common Stock",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      CREADES_HOLDINGS_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.asOf).toBe("2026-08-31");
    expect(result.data.rawWeightSum).toBeCloseTo(1, 12);
    expect(result.data.holdings).toHaveLength(15);
    expect(result.data.holdings.reduce((sum, holding) => sum + holding.weight, 0)).toBeCloseTo(1, 12);
    expect(result.data.holdings.find((holding) => holding.name === "Avanza")?.reportedWeight).toBeCloseTo(0.49, 12);
    expect(result.data.holdings.find((holding) => holding.name === "Aktiv förvaltning i kapitalförsäkring")?.reportedWeight).toBeCloseTo(0.17, 12);
    expect(result.data.holdings.some((holding) => holding.name === "Kreditz")).toBe(false);
    expect(result.data.holdings.some((holding) => holding.name === "Övriga tillgångar och skulder netto")).toBe(false);
    expect(result.data.holdings.some((holding) => holding.name === "Unrelated site metric")).toBe(false);
    expect(result.data.holdings.some((holding) => holding.name === "Totalt")).toBe(false);

    expect(result.data.source.name).toBe("Creades official NAV portfolio");
    expect(result.data.source.url).toBe(CREADES_HOLDINGS_URL);
    expect(result.data.source.provider).toBe("official-investment-company-holdings");
    expect(result.data.source.dataAsOf).toBe("2026-08-31");
  });

  it("marks only direct holdings in the official listed-assets section as issuer-fundamentals eligible", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(COMPLETE_CREADES_HTML, { status: 200 })));

    const result = await fetchOfficialInvestmentCompanyHoldings({
      ticker: "CRED-A.ST",
      name: "Creades AB",
      securityType: "Common Stock",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.holdings.find((holding) => holding.name === "Avanza")?.issuerFundamentalsEligible).toBe(true);
    expect(result.data.holdings.find((holding) => holding.name === "Silex")?.issuerFundamentalsEligible).toBe(true);
    expect(result.data.holdings.find((holding) => holding.name === "Aktiv förvaltning i kapitalförsäkring")?.issuerFundamentalsEligible).toBe(false);
    expect(result.data.holdings.find((holding) => holding.name === "StickerApp")?.issuerFundamentalsEligible).toBe(false);
    expect(result.data.holdings.find((holding) => holding.name === "Övriga onoterade värdepapper")?.issuerFundamentalsEligible).toBe(false);
  });

  it("fails closed instead of renormalizing when a material weighted row is missing", async () => {
    const incomplete = COMPLETE_CREADES_HTML.replace(
      "<tr><td>Avanza</td><td>15 907 000</td><td>6 406</td><td>47</td><td>49</td></tr>",
      "",
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(incomplete, { status: 200 })));

    const result = await fetchOfficialInvestmentCompanyHoldings({
      ticker: "CRED-A.ST",
      name: "Creades AB",
      securityType: "Common Stock",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("official_holdings_incomplete_or_unparseable");
  });

  it("fails closed when the official portfolio date is unavailable", async () => {
    const undated = COMPLETE_CREADES_HTML.replace("Substansvärde per 2026-08-31", "Substansvärde");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(undated, { status: 200 })));

    const result = await fetchOfficialInvestmentCompanyHoldings({
      ticker: "CRED-A.ST",
      name: "Creades AB",
      securityType: "Common Stock",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("official_holdings_incomplete_or_unparseable");
  });
});
