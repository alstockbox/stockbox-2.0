import { describe, expect, it } from "vitest";
import { parseSecReitSpecializedDocument } from "../../src/lib/data/sec-reit-specialized";

const context = {
  sourceUrl: "https://www.sec.gov/Archives/edgar/data/726728/example.htm",
  periodEnd: "2026-08-05",
};

describe("SEC REIT occupancy observation priority", () => {
  it("prefers explicit portfolio property occupancy over an earlier weak geographic-adjacent occupancy match", () => {
    const observations = parseSecReitSpecializedDocument(`
      <p>Portfolio mix and occupancy United States 79.5% Total ABR United Kingdom 15.0% Total ABR</p>
      <p>Q2 2026 Supplemental Operating & Financial Data</p>
      <p>Portfolio Overview as of June 30, 2026</p>
      <p>Number of properties 15,588 15,571 15,511</p>
      <p>Occupancy - by number of properties(7) 98.8% 98.9% 98.9%</p>
    `, context);

    const occupancy = observations.find((item) => item.metric === "occupancy");
    expect(occupancy).toMatchObject({
      value: 0.988,
      unit: "ratio",
      dataAsOf: "2026-06-30",
    });
  });
});
