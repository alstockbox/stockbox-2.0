import { describe, expect, it } from "vitest";
import { parseSecBankSpecializedDocument } from "../../src/lib/data/sec-bank-specialized";

const context = {
  sourceUrl: "https://www.sec.gov/Archives/edgar/data/19617/000162828026054343/jpm-20260630.htm",
  periodEnd: "2026-06-30",
};

function metricMap(html: string) {
  return Object.fromEntries(
    parseSecBankSpecializedDocument(html, context).map((item) => [item.metric, item]),
  );
}

describe("SEC bank specialist parser", () => {
  it("extracts JPMorgan's directly reported firmwide Standardized CET1 ratio", () => {
    const metrics = metricMap(`
      <table>
        <tr><th>Selected ratios and metrics</th><th>June 30, 2026</th><th>March 31, 2026</th></tr>
        <tr><td>Common equity Tier 1 (CET1) capital ratio - Standardized</td><td>14.2%</td><td>14.3%</td></tr>
      </table>
    `);

    expect(metrics.cet1CapitalRatio).toMatchObject({
      value: 0.142,
      unit: "ratio",
      dataAsOf: "2026-06-30",
      sourceUrl: context.sourceUrl,
      valueKind: "reported",
    });
  });

  it("does not promote a CET1 regulatory requirement into the reported firmwide ratio", () => {
    const metrics = metricMap(`
      <p>The Firm's Standardized CET1 capital ratio requirement, including regulatory buffers, was 11.5% as of June 30, 2026.</p>
    `);

    expect(metrics.cet1CapitalRatio).toBeUndefined();
  });

  it("does not promote a subsidiary CET1 ratio when the firmwide Standardized ratio is absent", () => {
    const metrics = metricMap(`
      <table>
        <tr><th>J.P. Morgan SE</th><th>June 30, 2026</th><th>Regulatory minimum</th></tr>
        <tr><td>CET1 capital ratio</td><td>17.2%</td><td>4.5%</td></tr>
      </table>
    `);

    expect(metrics.cet1CapitalRatio).toBeUndefined();
  });
});
