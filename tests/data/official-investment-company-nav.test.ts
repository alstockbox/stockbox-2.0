import { describe, expect, it } from "vitest";
import {
  parseCreadesOfficialNav,
  parseIndustrivardenOfficialNav,
  parseInvestorOfficialNav,
  parseLatourOfficialNav,
  parseLundbergsOfficialNav,
  parseSvolderOfficialNav,
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

  it("parses Svolder weekly NAV per share from official release listings", () => {
    const html = `<article><h2>Svolders substansvärde 2026-08-28: 60 SEK per aktie</h2></article>`;
    expect(parseSvolderOfficialNav(html)).toEqual({
      reportedNav: null,
      reportedNavPerShare: 60,
      navAsOf: "2026-08-28",
    });
  });

  it("parses Creades monthly NAV and total NAV when both are present", () => {
    const html = `
      <main>
        <h1>Substansvärde per 2026-08-31</h1>
        <p>Creades substansvärde per 31 augusti uppgår till 96 kronor per aktie.</p>
        <table><tr><td>Totalt</td><td>13 027</td><td>96</td><td>100</td></tr></table>
      </main>
    `;
    expect(parseCreadesOfficialNav(html)).toEqual({
      reportedNav: 13_027_000_000,
      reportedNavPerShare: 96,
      navAsOf: "2026-08-31",
    });
  });

  it("parses Lundbergs current total NAV from the official homepage wording", () => {
    const html = `<section><h2>Substansvärde</h2><strong>164 Mdkr</strong><time>2026-08-25</time></section>`;
    expect(parseLundbergsOfficialNav(html)).toEqual({
      reportedNav: 164_000_000_000,
      reportedNavPerShare: null,
      navAsOf: "2026-08-25",
    });
  });

  it("fails closed when official text does not contain a verifiable NAV", () => {
    expect(parseInvestorOfficialNav("<p>Investor update without NAV figures.</p>")).toBeNull();
    expect(parseLatourOfficialNav("<p>Latour update without a substansvärde table.</p>")).toBeNull();
    expect(parseIndustrivardenOfficialNav("<p>Industrivärden update without NAV.</p>")).toBeNull();
    expect(parseSvolderOfficialNav("<p>Svolder update without NAV.</p>")).toBeNull();
    expect(parseCreadesOfficialNav("<p>Creades update without NAV.</p>")).toBeNull();
    expect(parseLundbergsOfficialNav("<p>Lundbergs update without NAV.</p>")).toBeNull();
  });
});