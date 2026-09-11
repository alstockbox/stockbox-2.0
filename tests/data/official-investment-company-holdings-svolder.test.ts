import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchOfficialInvestmentCompanyHoldings,
  parseSvolderOfficialHoldings,
} from "../../src/lib/data/official-investment-company-holdings";

const SVOLDER_HOLDINGS_URL = "https://svolder.se/om-svolder/innehav/";

const COMPLETE_SVOLDER_HTML = `
<main>
  <p>Svolders innehav per 2026-05-31</p>
  <h1>Aktieportföljen</h1>
  <div>Aktie Aktiekurs SEK Marknadsvärde MSEK Andel av substansvärde %</div>
  <section><h2>Ependion</h2><span>149,00</span><span>837</span><span>14,6</span><p>Bolagsbeskrivning.</p></section>
  <section><h2>New Wave Group</h2><span>99,60</span><span>689</span><span>12,0</span><p>Bolagsbeskrivning.</p></section>
  <section><h2>Beijer Alma</h2><span>305,00</span><span>570</span><span>10,0</span><p>Bolagsbeskrivning.</p></section>
  <section><h2>Scandic Hotels Group</h2><span>90,75</span><span>514</span><span>9,0</span><p>Bolagsbeskrivning.</p></section>
  <section><h2>FM Mattsson Group</h2><span>78,20</span><span>419</span><span>7,3</span><p>Bolagsbeskrivning.</p></section>
  <section><h2>Troax Group</h2><span>113,00</span><span>376</span><span>6,6</span><p>Bolagsbeskrivning.</p></section>
  <section><h2>Systemair</h2><span>75,50</span><span>347</span><span>6,1</span><p>Bolagsbeskrivning.</p></section>
  <section><h2>Arjo</h2><span>24,64</span><span>314</span><span>5,5</span><p>Bolagsbeskrivning.</p></section>
  <section><h2>Platzer Fastigheter</h2><span>73,90</span><span>281</span><span>4,9</span><p>Bolagsbeskrivning.</p></section>
  <section><h2>MilDef Group</h2><span>185,95</span><span>242</span><span>4,2</span><p>Bolagsbeskrivning.</p></section>
  <section><h2>Elanders</h2><span>48,35</span><span>207</span><span>3,6</span><p>Bolagsbeskrivning.</p></section>
  <section><h2>XANO Industri</h2><span>50,00</span><span>202</span><span>3,5</span><p>Bolagsbeskrivning.</p></section>
  <section><h2>ITAB Shop Concept</h2><span>15,54</span><span>186</span><span>3,3</span><p>Bolagsbeskrivning.</p></section>
  <section><h2>Arla Plast</h2><span>40,95</span><span>108</span><span>1,9</span><p>Bolagsbeskrivning.</p></section>
  <section><h2>GARO</h2><span>14,14</span><span>95</span><span>1,7</span><p>Bolagsbeskrivning.</p></section>
  <section><h2>Boule Diagnostics</h2><span>3,32</span><span>14</span><span>0,2</span><p>Bolagsbeskrivning.</p></section>
  <footer>
    <div>Aktieportföljen 5 402 94,4</div>
    <div>Nettofordran(+)/nettoskuld(-) 323 5,6</div>
    <div>Totalt/Substansvärde 5 725 100,0</div>
  </footer>
</main>
`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("official Svolder holdings", () => {
  it("parses the complete official NAV exposure and preserves positive net receivable as a real portfolio component", () => {
    const parsed = parseSvolderOfficialHoldings(COMPLETE_SVOLDER_HTML);

    expect(parsed).not.toBeNull();
    expect(parsed?.asOf).toBe("2026-05-31");
    expect(parsed?.rawWeightSum).toBeCloseTo(1, 12);
    expect(parsed?.holdings).toHaveLength(17);
    expect(parsed?.holdings.reduce((sum, holding) => sum + holding.weight, 0)).toBeCloseTo(1, 12);
    expect(parsed?.holdings.find((holding) => holding.name === "Ependion")?.reportedWeight).toBeCloseTo(0.146, 12);
    expect(parsed?.holdings.find((holding) => holding.name === "New Wave Group")?.reportedWeight).toBeCloseTo(0.12, 12);
    expect(parsed?.holdings.find((holding) => holding.name === "Net receivable / cash")?.reportedWeight).toBeCloseTo(0.056, 12);

    const classifiedHoldings = parsed?.holdings as Array<{
      name: string;
      issuerFundamentalsEligible?: boolean;
    }> | undefined;
    expect(classifiedHoldings?.find((holding) => holding.name === "Ependion")?.issuerFundamentalsEligible).toBe(true);
    expect(classifiedHoldings?.find((holding) => holding.name === "Net receivable / cash")?.issuerFundamentalsEligible).toBe(false);
  });

  it("fails closed when the published equity weights do not reconcile to the official equity-portfolio summary", () => {
    const inconsistent = COMPLETE_SVOLDER_HTML.replace(
      "<section><h2>Ependion</h2><span>149,00</span><span>837</span><span>14,6</span>",
      "<section><h2>Ependion</h2><span>149,00</span><span>837</span><span>10,6</span>",
    );

    expect(parseSvolderOfficialHoldings(inconsistent)).toBeNull();
  });

  it("fails closed instead of representing a negative net debt residual as a positive holding", () => {
    const netDebt = COMPLETE_SVOLDER_HTML
      .replace("Nettofordran(+)/nettoskuld(-) 323 5,6", "Nettofordran(+)/nettoskuld(-) -323 -5,6")
      .replace("Totalt/Substansvärde 5 725 100,0", "Totalt/Substansvärde 5 079 88,8");

    expect(parseSvolderOfficialHoldings(netDebt)).toBeNull();
  });

  it("fetches Svolder's official portfolio with issuer-specific provenance", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(COMPLETE_SVOLDER_HTML, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOfficialInvestmentCompanyHoldings({
      ticker: "SVOL-B.ST",
      name: "Svolder AB",
      securityType: "Common Stock",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      SVOLDER_HOLDINGS_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.asOf).toBe("2026-05-31");
    expect(result.data.holdings).toHaveLength(17);
    expect(result.data.source.name).toBe("Svolder official portfolio");
    expect(result.data.source.url).toBe(SVOLDER_HOLDINGS_URL);
    expect(result.data.source.provider).toBe("official-investment-company-holdings");
    expect(result.data.source.dataAsOf).toBe("2026-05-31");
    expect(result.data.diagnostic.status).toBe("available");
  });
});
