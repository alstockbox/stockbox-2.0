import { describe, expect, it } from "vitest";
import {
  parseCreadesOfficialNav,
  parseIndustrivardenOfficialNav,
  parseInvestorOfficialNav,
  parseLatourOfficialNav,
  parseLatourOfficialNavHistory,
  parseLundbergsOfficialNav,
  parseSvolderOfficialAnnualNavHistory,
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

  it("parses Latour quarter columns into dated NAV/share history", () => {
    const html = `
      <table>
        <tr><th>Mått</th><th>Q2/23</th><th>Q3/2023</th><th>Q4/2023</th><th>Q1/2024</th></tr>
        <tr><td>Substansvärde, Mkr</td><td>123,527</td><td>110,061</td><td>126,675</td><td>130,240</td></tr>
        <tr><td>Substansvärde per aktie, kr</td><td>193</td><td>172</td><td>198</td><td>204</td></tr>
      </table>
    `;

    expect(parseLatourOfficialNavHistory(html)).toEqual([
      { date: "2023-06-30", navPerShare: 193 },
      { date: "2023-09-30", navPerShare: 172 },
      { date: "2023-12-31", navPerShare: 198 },
      { date: "2024-03-31", navPerShare: 204 },
    ]);
  });

  it("fails Latour history closed when quarter columns and NAV/share cells do not align", () => {
    const html = `
      <table>
        <tr><th>Mått</th><th>Q2/23</th><th>Q3/23</th><th>Q4/23</th></tr>
        <tr><td>Substansvärde per aktie, kr</td><td>193</td><td>172</td></tr>
      </table>
    `;

    expect(parseLatourOfficialNavHistory(html)).toEqual([]);
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

  it("parses Svolder fiscal-year NAV/share values as explicit annual anchors without inventing dates", () => {
    const html = `
      <table>
        <tr><th></th><th>24/25</th><th>23/24</th><th>22/23</th><th>21/22</th><th>20/21</th></tr>
        <tr><td>Substansvärde, SEK</td><td>57,20</td><td>58,80</td><td>51,20</td><td>57,30</td><td>69,50</td></tr>
      </table>
    `;

    expect(parseSvolderOfficialAnnualNavHistory(html)).toEqual([
      { year: 2025, navPerShare: 57.2 },
      { year: 2024, navPerShare: 58.8 },
      { year: 2023, navPerShare: 51.2 },
      { year: 2022, navPerShare: 57.3 },
      { year: 2021, navPerShare: 69.5 },
    ]);
  });

  it("fails Svolder annual NAV history closed when fiscal-year headers and NAV/share cells do not align", () => {
    const html = `
      <table>
        <tr><th></th><th>24/25</th><th>23/24</th><th>22/23</th></tr>
        <tr><td>Substansvärde, SEK</td><td>57,20</td><td>58,80</td></tr>
      </table>
    `;

    expect(parseSvolderOfficialAnnualNavHistory(html)).toEqual([]);
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