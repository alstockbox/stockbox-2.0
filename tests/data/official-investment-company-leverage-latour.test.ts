import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchOfficialInvestmentCompanyLeverage,
  parseLatourOfficialLeverageDisclosure,
} from "../../src/lib/data/official-investment-company-leverage";

const latour = {
  ticker: "LATO-B.ST",
  name: "Investment AB Latour",
  securityType: "Common Stock" as const,
};

const disclosureHtml = `
  <section>
    <h2>THE GROUP</h2>
    <p>
      The Group reported net debt of SEK 13,929 m (18,521 m). Net debt,
      excluding lease liabilities recognised under IFRS 16, was SEK 12,281 m
      (16,898 m) and is equivalent to 9 (11) per cent of the market value of total assets.
    </p>
  </section>
`;

describe("Latour official current leverage disclosure", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("parses the issuer-defined current leverage ratio without deriving it from debt or NAV", () => {
    expect(parseLatourOfficialLeverageDisclosure(disclosureHtml)).toEqual({
      ratio: 0.09,
      netDebtExcludingIfrs16: 12_281_000_000,
    });
  });

  it("fails closed when the exact net-debt-to-total-assets context is absent or ambiguous", () => {
    expect(parseLatourOfficialLeverageDisclosure(
      "Net debt was SEK 12,281 m and leverage was 9 per cent.",
    )).toBeNull();

    expect(parseLatourOfficialLeverageDisclosure(`${disclosureHtml}${disclosureHtml}`)).toBeNull();

    expect(parseLatourOfficialLeverageDisclosure(
      disclosureHtml.replace("9 (11) per cent", "109 (11) per cent"),
    )).toBeNull();
  });

  it("returns verified Latour leverage with explicit disclosure date and provenance", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-08T08:45:00.000Z"));
    const fetchMock = vi.fn().mockResolvedValue(new Response(disclosureHtml, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOfficialInvestmentCompanyLeverage(latour);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.ratio).toBe(0.09);
    expect(result.data.asOf).toBe("2026-06-30");
    expect(result.data.netDebtExcludingIfrs16).toBe(12_281_000_000);
    expect(result.data.source.provider).toBe("official-investment-company-leverage");
    expect(result.data.source.dataAsOf).toBe("2026-06-30");
    expect(result.data.source.url).toContain("latour");
    expect(result.data.diagnostic.status).toBe("available");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not configure the Latour-only current leverage adapter for another issuer", async () => {
    const result = await fetchOfficialInvestmentCompanyLeverage({
      ticker: "INVE-B.ST",
      name: "Investor AB",
      securityType: "Common Stock",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("official_leverage_adapter_not_configured");
  });
});
