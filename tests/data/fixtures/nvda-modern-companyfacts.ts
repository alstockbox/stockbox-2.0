import type { SecCompanyFacts, SecFactUnit } from "../../../src/lib/data/sec-resolver";

type ModernValues = [number, number, number];

const duration = (modern: ModernValues) => ({
  units: {
    USD: [
      { start: "2011-01-31", end: "2012-01-29", form: "10-K", filed: "2012-03-13", val: 4_000_000_000 },
      { start: "2011-01-31", end: "2011-05-01", form: "10-Q", filed: "2011-05-13", val: 1_000_000_000 },
      { start: "2012-01-30", end: "2012-04-29", form: "10-Q", filed: "2012-05-11", val: 1_100_000_000 },
      { start: "2025-01-27", end: "2026-01-25", form: "10-K", filed: "2026-02-25", fy: 2026, fp: "FY", accn: "0001045810-26-000021", val: modern[0] },
      { start: "2025-01-27", end: "2025-04-27", form: "10-Q", filed: "2026-05-20", fy: 2027, fp: "Q1", accn: "0001045810-26-000052", val: modern[1] },
      { start: "2026-01-26", end: "2026-04-26", form: "10-Q", filed: "2026-05-20", fy: 2027, fp: "Q1", accn: "0001045810-26-000052", val: modern[2] },
    ] satisfies SecFactUnit[],
  },
});

const instant = (conceptValues: [number, number, number]) => ({
  units: {
    USD: [
      { end: "2025-04-27", form: "10-Q", filed: "2025-05-28", val: conceptValues[0] },
      { end: "2026-01-25", form: "10-K", filed: "2026-02-25", val: conceptValues[1] },
      { end: "2026-04-26", form: "10-Q", filed: "2026-05-20", val: conceptValues[2] },
    ] satisfies SecFactUnit[],
  },
});

export const nvdaModernCompanyFacts: SecCompanyFacts = {
  cik: 1045810,
  entityName: "NVIDIA CORP",
  facts: {
    "us-gaap": {
      Revenues: duration([215_938_000_000, 44_062_000_000, 81_615_000_000]),
      GrossProfit: duration([153_463_000_000, 26_668_000_000, 61_157_000_000]),
      OperatingIncomeLoss: duration([130_387_000_000, 21_638_000_000, 53_536_000_000]),
      NetIncomeLoss: duration([120_067_000_000, 18_775_000_000, 58_321_000_000]),
      NetCashProvidedByUsedInOperatingActivities: duration([102_718_000_000, 27_414_000_000, 50_344_000_000]),
      PaymentsToAcquireProductiveAssets: duration([6_042_000_000, 1_227_000_000, 1_757_000_000]),
      Assets: instant([125_254_000_000, 206_803_000_000, 259_474_000_000]),
      Liabilities: instant([41_411_000_000, 49_510_000_000, 64_000_000_000]),
      StockholdersEquity: instant([83_843_000_000, 157_293_000_000, 195_474_000_000]),
      CashAndCashEquivalentsAtCarryingValue: instant([15_234_000_000, 10_605_000_000, 13_237_000_000]),
      AssetsCurrent: instant([89_935_000_000, 125_605_000_000, 150_995_000_000]),
      LiabilitiesCurrent: instant([26_542_000_000, 32_163_000_000, 43_884_000_000]),
    },
  },
};
