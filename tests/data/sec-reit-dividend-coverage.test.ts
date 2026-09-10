import { describe, expect, it } from "vitest";
import { parseSecReitSpecializedDocument } from "../../src/lib/data/sec-reit-specialized";

const context = {
  sourceUrl: "https://www.sec.gov/Archives/edgar/data/726728/000072672826000044/o-991q22026.htm",
  periodEnd: "2026-08-05",
};

function metricMap(html: string) {
  return Object.fromEntries(
    parseSecReitSpecializedDocument(html, context).map((item) => [item.metric, item]),
  );
}

describe("SEC REIT dividend coverage basis safety", () => {
  it("derives coverage only when dividends per share and diluted AFFO per share share the same explicit quarter", () => {
    const metrics = metricMap(`
      <p>The amount of monthly dividends paid per share increased 0.7% to $0.812 in the three months ended June 30, 2026, as compared to $0.806 during the three months ended June 30, 2025, representing 74.5% of our diluted AFFO per share of $1.09 during the three months ended June 30, 2026.</p>
    `);

    expect(metrics.dividendCoverage).toMatchObject({
      value: 1.09 / 0.812,
      unit: "ratio",
      dataAsOf: "2026-06-30",
      sourceUrl: context.sourceUrl,
      valueKind: "derived",
      inputs: ["adjustedFundsFromOperationsPerShare", "dividendsPaidPerShare"],
    });
  });

  it("does not derive dividend coverage from AFFO payout alone", () => {
    const metrics = metricMap(`
      <table>
        <tr><th>Three Months Ended June 30, 2026</th></tr>
        <tr><td>AFFO Payout %</td><td>74.5%</td></tr>
      </table>
    `);

    expect(metrics.dividendCoverage).toBeUndefined();
  });

  it("does not mix dividends and AFFO from different quarters", () => {
    const metrics = metricMap(`
      <p>The amount of monthly dividends paid per share was $0.812 in the three months ended June 30, 2026, representing 74.5% of our diluted AFFO per share of $1.09 during the three months ended March 31, 2026.</p>
    `);

    expect(metrics.dividendCoverage).toBeUndefined();
  });
});
