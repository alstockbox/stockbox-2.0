import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as navModule from "../../src/lib/data/official-investment-company-nav";

describe("StockBox 3 official investment-company NAV registry expansion", () => {
  it("adds fail-closed official NAV parsers and issuer adapters for Svolder, Creades and Lundbergs", () => {
    const exported = navModule as unknown as Record<string, unknown>;
    expect(typeof exported.parseSvolderOfficialNav).toBe("function");
    expect(typeof exported.parseCreadesOfficialNav).toBe("function");
    expect(typeof exported.parseLundbergsOfficialNav).toBe("function");

    const parseSvolder = exported.parseSvolderOfficialNav as (html: string) => unknown;
    const parseCreades = exported.parseCreadesOfficialNav as (html: string) => unknown;
    const parseLundbergs = exported.parseLundbergsOfficialNav as (html: string) => unknown;

    expect(parseSvolder(`<article><h2>Svolders substansvärde 2026-08-28: 60 SEK per aktie</h2></article>`)).toEqual({
      reportedNav: null,
      reportedNavPerShare: 60,
      navAsOf: "2026-08-28",
    });
    expect(parseCreades(`
      <main>
        <h1>Substansvärde per 2026-08-31</h1>
        <p>Creades substansvärde per 31 augusti uppgår till 96 kronor per aktie.</p>
        <table><tr><td>Totalt</td><td>13 027</td><td>96</td><td>100</td></tr></table>
      </main>
    `)).toEqual({
      reportedNav: 13_027_000_000,
      reportedNavPerShare: 96,
      navAsOf: "2026-08-31",
    });
    expect(parseLundbergs(`<section><h2>Substansvärde</h2><strong>164 Mdkr</strong><time>2026-08-25</time></section>`)).toEqual({
      reportedNav: 164_000_000_000,
      reportedNavPerShare: null,
      navAsOf: "2026-08-25",
    });

    expect(parseSvolder("<p>Svolder update without NAV.</p>")).toBeNull();
    expect(parseCreades("<p>Creades update without NAV.</p>")).toBeNull();
    expect(parseLundbergs("<p>Lundbergs update without NAV.</p>")).toBeNull();

    const source = readFileSync(
      path.join(process.cwd(), "src/lib/data/official-investment-company-nav.ts"),
      "utf8",
    );
    expect(source).toContain('id: "svolder"');
    expect(source).toContain('id: "creades"');
    expect(source).toContain('id: "lundbergs"');
    expect(source).toContain('https://svolder.se/pressreleaser/');
    expect(source).toContain('https://www.creades.se/innehav/substansvarde/');
    expect(source).toContain('https://www.lundbergforetagen.se/sv');
    expect(source).not.toContain("marketCap");
    expect(source).not.toContain("bookValue");
  });
});
