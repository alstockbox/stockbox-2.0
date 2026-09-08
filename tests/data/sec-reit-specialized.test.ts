import { describe, expect, it } from "vitest";
import { parseSecReitSpecializedDocument } from "../../src/lib/data/sec-reit-specialized";

const context = {
  sourceUrl: "https://www.sec.gov/Archives/edgar/data/1/example-ex991.htm",
  periodEnd: "2026-06-30",
};

const filingContext = {
  sourceUrl: "https://www.sec.gov/Archives/edgar/data/1/example-ex991.htm",
  periodEnd: "2026-07-29",
};

function metricMap(html: string, parserContext = context) {
  return Object.fromEntries(
    parseSecReitSpecializedDocument(html, parserContext).map((item) => [item.metric, item]),
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

  it("prefers the percentage immediately before occupancy over a following geographic mix percentage", () => {
    const metrics = metricMap(`
      <p>Portfolio Overview As of June 30, 2026</p>
      <p>98.8% occupancy United States 79.5% Total ABR United Kingdom 15.0% Total ABR</p>
    `, filingContext);

    expect(metrics.occupancy).toMatchObject({
      value: 0.988,
      unit: "ratio",
      dataAsOf: "2026-06-30",
    });
  });

  it("prefers an explicit fixed-charge actual over covenant minimums", () => {
    const metrics = metricMap(`
      <p>Second Quarter 2026 Supplemental Information</p>
      <p>Debt Covenants as of June 30, 2026 Covenant Actual Fixed charge coverage ratio &gt;1.5x 7.1x</p>
      <p>Debt Metrics - Prologis Share June 30, 2026 March 31, 2026 Fixed charge coverage ratio 6.4x 6.4x</p>
    `, filingContext);

    expect(metrics.fixedChargeCoverage).toMatchObject({
      value: 6.4,
      unit: "ratio",
      dataAsOf: "2026-06-30",
    });
  });

  it("does not promote a covenant minimum into fixed-charge coverage when no actual metric is reported", () => {
    const metrics = metricMap(`
      <p>Debt Covenants as of June 30, 2026</p>
      <p>Required Actuals Fixed Charge Coverage Ratio &gt;1.5x</p>
    `, filingContext);

    expect(metrics.fixedChargeCoverage).toBeUndefined();
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

  it("extracts diluted FFO and AFFO per share from an explicitly dated results table", () => {
    const metrics = metricMap(`
      <table>
        <tr><th>Non-GAAP Measures and Other Supplemental Data</th><th>Three Months Ended</th></tr>
        <tr><th></th><th>June 30, 2026</th><th>March 31, 2026</th><th>June 30, 2025</th></tr>
        <tr><td>Diluted FFO per share</td><td>$8.61</td><td>$7.68</td><td>$7.03</td></tr>
        <tr><td>Diluted AFFO per share</td><td>$11.78</td><td>$10.79</td><td>$9.91</td></tr>
      </table>
    `, filingContext);

    expect(metrics.fundsFromOperationsPerShare).toMatchObject({
      value: 8.61,
      unit: "per_share",
      dataAsOf: "2026-06-30",
      sourceUrl: filingContext.sourceUrl,
    });
    expect(metrics.adjustedFundsFromOperationsPerShare).toMatchObject({
      value: 11.78,
      unit: "per_share",
      dataAsOf: "2026-06-30",
      sourceUrl: filingContext.sourceUrl,
    });
  });

  it("prefers diluted values in section-style FFO and AFFO per-common-share tables", () => {
    const metrics = metricMap(`
      <table>
        <tr><th></th><th>Three months ended June 30, 2026</th><th>Three months ended June 30, 2025</th></tr>
        <tr><td>FFO per common share:</td><td></td><td></td></tr>
        <tr><td>Basic</td><td>$1.08</td><td>$0.89</td></tr>
        <tr><td>Diluted</td><td>$1.07</td><td>$0.88</td></tr>
        <tr><td>AFFO per common share:</td><td></td><td></td></tr>
        <tr><td>Basic</td><td>$1.10</td><td>$1.07</td></tr>
        <tr><td>Diluted</td><td>$1.09</td><td>$1.05</td></tr>
      </table>
    `, filingContext);

    expect(metrics.fundsFromOperationsPerShare).toMatchObject({
      value: 1.07,
      unit: "per_share",
      dataAsOf: "2026-06-30",
    });
    expect(metrics.adjustedFundsFromOperationsPerShare).toMatchObject({
      value: 1.09,
      unit: "per_share",
      dataAsOf: "2026-06-30",
    });
  });

  it("does not promote guidance, undated per-share values, or modified FFO aliases into reported FFO/AFFO", () => {
    const observations = parseSecReitSpecializedDocument(`
      <p>2026 Guidance: Core FFO per diluted share is expected to range from $6.22 to $6.30.</p>
      <p>Diluted AFFO per share $11.78</p>
      <table><tr><td>Normalized FFO per share</td><td>$1.23</td></tr></table>
    `, filingContext);

    expect(observations.filter((item) => {
      const metric = String(item.metric);
      return metric === "fundsFromOperationsPerShare"
        || metric === "adjustedFundsFromOperationsPerShare";
    })).toEqual([]);
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
