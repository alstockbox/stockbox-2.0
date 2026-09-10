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

describe("SEC REIT direct AFFO payout prose", () => {
  it("extracts Realty Income's explicitly reported current-quarter AFFO payout from prose", () => {
    const metrics = metricMap(`
      <p>In June 2026, we announced the 115th consecutive quarterly dividend increase. The annualized dividend amount as of June 30, 2026 was $3.252 per share. The amount of monthly dividends paid per share increased 0.7% to $0.812 in the three months ended June 30, 2026, as compared to $0.806 during the three months ended June 30, 2025, representing 74.5% of our diluted AFFO per share of $1.09 during the three months ended June 30, 2026.</p>
    `);

    expect(metrics.affoPayout).toMatchObject({
      value: 0.745,
      unit: "ratio",
      dataAsOf: "2026-06-30",
      sourceUrl: context.sourceUrl,
    });
  });

  it("does not treat AFFO payout guidance as a reported actual", () => {
    const metrics = metricMap(`
      <p>2026 Guidance: we expect dividends to represent 74.5% of diluted AFFO per share.</p>
    `);

    expect(metrics.affoPayout).toBeUndefined();
  });
});
