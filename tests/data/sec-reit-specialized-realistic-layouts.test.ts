import { describe, expect, it } from "vitest";
import { parseSecReitSpecializedDocument } from "../../src/lib/data/sec-reit-specialized";

describe("SEC REIT specialized parser realistic filing layouts", () => {
  it("parses reported REIT ratios when labels contain SEC exhibit footnote markers and expanded definitions", () => {
    const html = `
      <table>
        <tr><td>Occupancy - by number of properties(7)</td><td>98.8 %</td><td>98.9 %</td></tr>
        <tr><td>Net Debt and Preferred Stock/Annualized Pro Forma Adjusted EBITDAre(8)</td><td>5.4x</td><td>5.2x</td></tr>
        <tr><td>Debt service and fixed charge coverage (trailing 12 months)(10)(11)</td><td>4.7x</td><td>4.7x</td></tr>
      </table>
    `;

    const observations = parseSecReitSpecializedDocument(html, {
      sourceUrl: "https://www.sec.gov/Archives/edgar/data/1/example.htm",
      periodEnd: "2026-06-30",
    });

    expect(observations).toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: "occupancy", value: 0.988, dataAsOf: "2026-06-30" }),
      expect.objectContaining({ metric: "netDebtToEbitdare", value: 5.4, dataAsOf: "2026-06-30" }),
      expect.objectContaining({ metric: "fixedChargeCoverage", value: 4.7, dataAsOf: "2026-06-30" }),
    ]));
  });

  it("does not mistake later comparative columns for the current reported value", () => {
    const html = `<div>Occupancy - by number of properties(7) 98.8 % 98.9 % 98.7 %</div>`;

    const observations = parseSecReitSpecializedDocument(html, {
      sourceUrl: "https://www.sec.gov/Archives/edgar/data/1/example.htm",
      periodEnd: "2026-06-30",
    });

    expect(observations.find((item) => item.metric === "occupancy")?.value).toBe(0.988);
  });
});
