import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchOfficialInvestmentCompanyKeyRatios,
  parseIndustrivardenOfficialKeyRatios,
} from "../../src/lib/data/official-investment-company-key-ratios";

const html = `
<table>
  <thead><tr><th></th><th>2025</th><th>2024</th><th>2023</th><th>2022</th><th>2021</th><th>2020</th></tr></thead>
  <tbody>
    <tr><td>Equities portfolio total return, %</td><td>22</td><td>8</td><td>33</td><td>-9</td><td>21</td><td>7</td></tr>
    <tr><td>net purchases/sales, SEK mn</td><td>4,650</td><td>4,566</td><td>2,854</td><td>3,184</td><td>2,258</td><td>4,106</td></tr>
    <tr><td>Net debt value, SEK mn</td><td>-5,920</td><td>-6,914</td><td>-7,295</td><td>-7,355</td><td>-6,500</td><td>-7,654</td></tr>
    <tr><td>debt-equities ratio, %</td><td>3</td><td>4</td><td>5</td><td>5</td><td>4</td><td>6</td></tr>
    <tr><td>Net asset value per share, SEK</td><td>444</td><td>370</td><td>329</td><td>293</td><td>332</td><td>279</td></tr>
    <tr><td>Number of shares outstanding total, thousands</td><td>431,899</td><td>431,899</td><td>431,899</td><td>431,899</td><td>431,899</td><td>435,210</td></tr>
    <tr><td>Dividends paid value, SEK mn</td><td>3,779</td><td>3,563</td><td>3,347</td><td>3,131</td><td>2,915</td><td>3,590</td></tr>
    <tr><td>Dividends paid value per share, SEK</td><td>8.75</td><td>8.25</td><td>7.75</td><td>7.25</td><td>6.75</td><td>8.25</td></tr>
    <tr><td>Dividends received, SEK mn</td><td>9,532</td><td>8,585</td><td>6,418</td><td>5,479</td><td>8,081</td><td>657</td></tr>
  </tbody>
</table>`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("official investment-company key-ratio history", () => {
  it("parses aligned multi-year Industrivärden capital and dividend history without renormalizing values", () => {
    const parsed = parseIndustrivardenOfficialKeyRatios(html);

    expect(parsed).not.toBeNull();
    expect(parsed?.years).toHaveLength(6);
    expect(parsed?.years[0]).toEqual({
      year: 2025,
      portfolioReturn: 0.22,
      netPurchasesSales: 4_650_000_000,
      netDebt: -5_920_000_000,
      debtEquitiesRatio: 0.03,
      navPerShare: 444,
      sharesOutstanding: 431_899_000,
      dividendsPaid: 3_779_000_000,
      dividendPerShare: 8.75,
      dividendsReceived: 9_532_000_000,
    });
    expect(parsed?.years[5]).toEqual(expect.objectContaining({
      year: 2020,
      portfolioReturn: 0.07,
      netPurchasesSales: 4_106_000_000,
      netDebt: -7_654_000_000,
      dividendPerShare: 8.25,
      dividendsReceived: 657_000_000,
    }));
  });

  it("fails closed when the table does not contain enough aligned annual evidence", () => {
    const incomplete = `
      <table>
        <tr><th></th><th>2025</th><th>2024</th></tr>
        <tr><td>Net asset value per share, SEK</td><td>444</td><td>370</td></tr>
        <tr><td>Dividends paid value per share, SEK</td><td>8.75</td><td>8.25</td></tr>
      </table>`;

    expect(parseIndustrivardenOfficialKeyRatios(incomplete)).toBeNull();
  });

  it("rejects malformed numeric cells instead of shifting later years onto the wrong year", () => {
    const malformed = html.replace("<td>4,566</td>", "<td>n/a</td>");

    expect(parseIndustrivardenOfficialKeyRatios(malformed)).toBeNull();
  });

  it("does not pretend unsupported investment companies have verified key-ratio history", async () => {
    const result = await fetchOfficialInvestmentCompanyKeyRatios({
      ticker: "BRK-B",
      name: "Berkshire Hathaway Inc.",
      securityType: "Common Stock",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("official_key_ratios_adapter_not_configured");
    expect(result.diagnostic.status).toBe("unavailable");
  });
});