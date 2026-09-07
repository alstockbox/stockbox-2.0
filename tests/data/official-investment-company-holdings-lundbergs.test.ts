import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchOfficialInvestmentCompanyHoldings,
  parseLundbergsOfficialHoldings,
} from "../../src/lib/data/official-investment-company-holdings";

const LUNDBERGS_HOLDINGS_URL = "https://www.lundbergforetagen.se/sv";

const COMPLETE_LUNDBERGS_HTML = `
<main>
  <section>
    <p>Lundbergs investerar i fastigheter och börsnoterade företag.</p>
    <ul>
      <li>Lundbergs Fastigheter 16,0%</li>
      <li>Holmen 11,4%</li>
      <li>Hufvudstaden 7,9%</li>
      <li>Husqvarna Group 1,2%</li>
      <li>Industrivärden 29,7%</li>
      <li>Indutrade 12,7%</li>
      <li>Alleima 1,4%</li>
      <li>Handelsbanken 5,7%</li>
      <li>Sandvik 9,9%</li>
      <li>Skanska 3,5%</li>
      <li>Övriga värdepapper 1,6%</li>
    </ul>
    <p>De börsnoterade innehaven är värderade till marknadsvärde.</p>
    <p>Lundbergs Fastigheter redovisas till bedömt marknadsvärde på fastigheterna med avdrag för nettoskulder inklusive uppskjuten skatt.</p>
  </section>
  <section>
    <h3>Substansvärde</h3>
    <p>150 Mdkr 2026-05-19</p>
  </section>
</main>
`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("official Lundbergs holdings", () => {
  it("parses the complete official NAV exposure without pretending private real estate or aggregate securities are listed equities", () => {
    const parsed = parseLundbergsOfficialHoldings(COMPLETE_LUNDBERGS_HTML);

    expect(parsed).not.toBeNull();
    expect(parsed?.asOf).toBe("2026-05-19");
    expect(parsed?.rawWeightSum).toBeCloseTo(1.01, 12);
    expect(parsed?.holdings).toHaveLength(11);
    expect(parsed?.holdings.reduce((sum, holding) => sum + holding.weight, 0)).toBeCloseTo(1, 12);
    expect(parsed?.holdings.find((holding) => holding.name === "Industrivärden")?.reportedWeight).toBeCloseTo(0.297, 12);
    expect(parsed?.holdings.find((holding) => holding.name === "Lundbergs Fastigheter")?.reportedWeight).toBeCloseTo(0.16, 12);
    expect(parsed?.holdings.find((holding) => holding.name === "Övriga värdepapper")?.reportedWeight).toBeCloseTo(0.016, 12);
  });

  it("ignores unrelated percentage list items outside the issuer's official allocation section", () => {
    const withUnrelatedPercentageList = COMPLETE_LUNDBERGS_HTML.replace(
      "<main>",
      "<main><nav><ul><li>Unrelated navigation metric 4,0%</li></ul></nav>",
    );

    const parsed = parseLundbergsOfficialHoldings(withUnrelatedPercentageList);

    expect(parsed).not.toBeNull();
    expect(parsed?.rawWeightSum).toBeCloseTo(1.01, 12);
    expect(parsed?.holdings).toHaveLength(11);
    expect(parsed?.holdings.some((holding) => holding.name === "Unrelated navigation metric")).toBe(false);
  });

  it("fails closed when a material portfolio row is missing instead of renormalizing incomplete exposure", () => {
    const incomplete = COMPLETE_LUNDBERGS_HTML.replace("<li>Industrivärden 29,7%</li>", "");

    expect(parseLundbergsOfficialHoldings(incomplete)).toBeNull();
  });

  it("fails closed when the official NAV date cannot be tied to the portfolio snapshot", () => {
    const undated = COMPLETE_LUNDBERGS_HTML.replace("150 Mdkr 2026-05-19", "150 Mdkr");

    expect(parseLundbergsOfficialHoldings(undated)).toBeNull();
  });

  it("fetches Lundbergs' official portfolio with issuer-specific provenance", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(COMPLETE_LUNDBERGS_HTML, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOfficialInvestmentCompanyHoldings({
      ticker: "LUND-B.ST",
      name: "L E Lundbergföretagen AB",
      securityType: "Common Stock",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      LUNDBERGS_HOLDINGS_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.asOf).toBe("2026-05-19");
    expect(result.data.holdings).toHaveLength(11);
    expect(result.data.source.name).toBe("Lundbergs official portfolio");
    expect(result.data.source.url).toBe(LUNDBERGS_HOLDINGS_URL);
    expect(result.data.source.provider).toBe("official-investment-company-holdings");
    expect(result.data.source.dataAsOf).toBe("2026-05-19");
    expect(result.data.diagnostic.status).toBe("available");
  });
});