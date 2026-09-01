import { describe, expect, it } from "vitest";
import {
  parseIndustrivardenOfficialNav,
  parseInvestorOfficialNav,
  parseLatourOfficialNav,
} from "../../src/lib/data/official-investment-company-nav";

describe("official investment-company NAV parsing", () => {
  it("parses Investor adjusted NAV from its official disclosure wording", () => {
    const html = `<main><p>Adjusted net asset value (NAV) was SEK 964.1 bn (SEK 397 per share) on June 30, 2026.</p></main>`;
    expect(parseInvestorOfficialNav(html)).toEqual({
      reportedNav: 964_100_000_000,
      reportedNavPerShare: 397,
      navAsOf: "2026-06-30",
    });
  });

  it("parses Latour substansvärde table values without treating commas as decimals", () => {
    const html = `
      <table>
        <tr><th>Mått</th><th>Q1/26</th><th>Q2/26</th></tr>
        <tr><td>Substansvärde, Mkr</td><td>125,100</td><td>129,900</td></tr>
        <tr><td>Substansvärde per aktie, kr</td><td>196</td><td>203</td></tr>
      </table>
    `;
    expect(parseLatourOfficialNav(html)).toEqual({
      reportedNav: 129_900_000_000,
      reportedNavPerShare: 203,
      navAsOf: "2026-06-30",
    });
  });

  it("parses Industrivärden NAV per share from an official press-release phrase", () => {
    const html = `<article><p>On August 31, 2026, net asset value was SEK 532 per share.</p></article>`;
    expect(parseIndustrivardenOfficialNav(html)).toEqual({
      reportedNav: null,
      reportedNavPerShare: 532,
      navAsOf: "2026-08-31",
    });
  });

  it("fails closed when official text does not contain a verifiable NAV", () => {
    expect(parseInvestorOfficialNav("<p>Investor update without NAV figures.</p>")).toBeNull();
    expect(parseLatourOfficialNav("<p>Latour update without a substansvärde table.</p>")).toBeNull();
    expect(parseIndustrivardenOfficialNav("<p>Industrivärden update without NAV.</p>")).toBeNull();
  });
});
