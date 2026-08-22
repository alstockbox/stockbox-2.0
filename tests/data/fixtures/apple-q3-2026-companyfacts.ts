import type { SecCompanyFacts, SecFactUnit } from "../../../src/lib/data/sec-resolver";

const usd = (billions: number) => billions * 1_000_000_000;
const duration = (values: [number, number, number, number, number, number, number][]) => ({
  units: {
    USD: values.map(([fy2024, ytd2024, quarter2025, ytd2025, fy2025, quarter2026, ytd2026]) => [
      { start: "2023-10-01", end: "2024-09-28", form: "10-K", filed: "2024-11-01", accn: "fy-2024", fy: 2024, val: usd(fy2024) },
      { start: "2023-10-01", end: "2024-06-29", form: "10-Q", filed: "2024-08-02", accn: "q3-2024-ytd", fy: 2024, val: usd(ytd2024) },
      { start: "2025-03-30", end: "2025-06-28", form: "10-Q", filed: "2025-08-01", accn: "q3-2025-quarter", fy: 2025, val: usd(quarter2025) },
      { start: "2024-09-29", end: "2025-06-28", form: "10-Q", filed: "2025-08-01", accn: "q3-2025-ytd", fy: 2025, val: usd(ytd2025) },
      { start: "2024-09-29", end: "2025-09-27", form: "10-K", filed: "2025-10-31", accn: "fy-2025", fy: 2025, val: usd(fy2025) },
      { start: "2026-03-29", end: "2026-06-27", form: "10-Q", filed: "2026-07-31", accn: "q3-2026-quarter", fy: 2026, val: usd(quarter2026) },
      { start: "2025-09-28", end: "2026-06-27", form: "10-Q", filed: "2026-07-31", accn: "q3-2026-ytd", fy: 2026, val: usd(ytd2026) },
    ]).flat() as SecFactUnit[],
  },
});

const instant = (values: [string, number, string, string][]) => ({
  units: {
    USD: values.map(([end, value, form, filed]) => ({ end, form, filed, accn: `${end}-${form}`, val: usd(value) })),
  },
});

const balanceDates: [string, string, string][] = [
  ["2024-09-28", "10-K", "2024-11-01"],
  ["2025-06-28", "10-Q", "2025-08-01"],
  ["2025-09-27", "10-K", "2025-10-31"],
  ["2026-06-27", "10-Q", "2026-07-31"],
];
const balances = (values: number[]) => instant(balanceDates.map(([end, form, filed], index) => [end, values[index], form, filed]));

export const appleQ3CompanyFacts: SecCompanyFacts = {
  cik: 320193,
  entityName: "Apple Inc.",
  facts: {
    "us-gaap": {
      RevenueFromContractWithCustomerExcludingAssessedTax: duration([[391.035, 296.105, 94.036, 313.695, 416.161, 109.417, 364.357]]),
      GrossProfit: duration([[180.683, 136.851, 43.718, 146.860, 195.201, 54.770, 178.782]]),
      OperatingIncomeLoss: duration([[123.216, 93.653, 30.000, 100.623, 133.050, 35.000, 122.432]]),
      NetIncomeLoss: duration([[93.736, 79.000, 26.000, 84.544, 112.010, 27.000, 101.464]]),
      NetCashProvidedByUsedInOperatingActivities: duration([[118.254, 91.443, 24.000, 81.754, 111.482, 31.000, 116.996]]),
      PaymentsToAcquirePropertyPlantAndEquipment: duration([[9.447, 6.539, 3.000, 9.473, 12.715, 2.000, 6.799]]),
      Assets: balances([364.980, 331.495, 359.241, 383.266]),
      Liabilities: balances([308.030, 265.560, 285.508, 275.746]),
      StockholdersEquity: balances([56.950, 65.935, 73.733, 107.520]),
      CashAndCashEquivalentsAtCarryingValue: balances([29.943, 36.269, 35.934, 39.544]),
      AssetsCurrent: balances([152.987, 122.491, 147.957, 149.818]),
      LiabilitiesCurrent: balances([176.392, 131.624, 165.631, 149.326]),
      CommercialPaper: balances([9.967, 3.995, 7.979, 1.997]),
      LongTermDebtCurrent: balances([10.912, 10.992, 12.350, 11.007]),
      LongTermDebtNoncurrent: balances([85.750, 82.209, 78.328, 71.340]),
    },
  },
};
