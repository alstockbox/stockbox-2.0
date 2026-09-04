import { describe, expect, it } from "vitest";
import { parseSecReitSpecializedDocument } from "../../src/lib/data/sec-reit-specialized";

const context = {
  sourceUrl: "https://www.sec.gov/Archives/edgar/data/1/example-ex991.htm",
  periodEnd: "2026-06-30",
};

function metricMap(html: string) {
  return Object.fromEntries(
    parseSecReitSpecializedDocument(html, context).map((item) => [item.metric, item]),
  );
}

describe("SEC REIT specialist document parser", () => {
  it("extracts explicitly reported point-in-time occupancy and EBITDAre leverage", () => {
    const metrics = metricMap(`
      <html><body>
        <p>Portfolio Overview As of June 30, 2026</p>
        <p><strong>98.8%</strong> occupancy</p>
        <p>Net Debt to Annualized Pro Forma Adjusted EBITDAre was <strong>5.4x</strong></p>
      </body></html>
    `);

    expect(metrics.occupancy).toMatchObject({
      value: 0.988,
      unit: "ratio",
      dataAsOf: "2026-06-30",
      sourceUrl: context.sourceUrl,
    });
    expect(metrics.netDebtToEbitdare).toMatchObject({
      value: 5.4,
      unit: "ratio",
      dataAsOf: "2026-06-30",
    });
  });

  it("extracts table-style period-end occupancy and same-store NOI growth", () => {
    const metrics = metricMap(`
      <table>
        <tr><td>Period End Occupancy</td><td>95.5%</td></tr>
        <tr><td>Cash Same Store NOI*</td><td>8.5%</td></tr>
      </table>
    `);

    expect(metrics.occupancy?.value).toBeCloseTo(0.955);
    expect(metrics.sameStoreNoiGrowth?.value).toBeCloseTo(0.085);
  });

  it("extracts an explicitly labeled fixed-charge coverage ratio", () => {
    const metrics = metricMap(`
      <table><tr><td>Fixed Charge Coverage Ratio</td><td>4.7x</td></tr></table>
    `);

    expect(metrics.fixedChargeCoverage).toMatchObject({
      value: 4.7,
      unit: "ratio",
      dataAsOf: "2026-06-30",
    });
  });

  it("does not promote guidance, approximate targets, generic EBITDA, or unrelated occupancy text into current specialist facts", () => {
    const observations = parseSecReitSpecializedDocument(`
      <p>2026 Guidance: Occupancy approximately 98.5%</p>
      <p>Adjusted EBITDA is expected to range between $1.2 billion and $1.3 billion.</p>
      <p>Tenant occupancy costs increased during the period.</p>
      <p>Same store revenue growth was 4.2%.</p>
    `, context);

    expect(observations).toEqual([]);
  });

  it("does not infer FFO, AFFO, or EBITDAre from generic GAAP/non-GAAP values", () => {
    const observations = parseSecReitSpecializedDocument(`
      <p>Net income was $344 million.</p>
      <p>Real estate depreciation was $620 million.</p>
      <p>Core EBITDA was $159 million.</p>
      <p>Free cash flow was $210 million.</p>
    `, context);

    expect(observations).toEqual([]);
  });
});
