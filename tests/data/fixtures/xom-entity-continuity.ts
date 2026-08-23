import type { SecCompanyFacts, SecFactUnit } from "../../../src/lib/data/sec-resolver";

const oldDuration = (annual2023: number, annual2024: number, annual2025: number, ytd2025: number) => ({
  units: { USD: [
    { start: "2023-01-01", end: "2023-12-31", form: "10-K", filed: "2024-02-28", val: annual2023 },
    { start: "2024-01-01", end: "2024-12-31", form: "10-K", filed: "2025-02-28", val: annual2024 },
    { start: "2025-01-01", end: "2025-12-31", form: "10-K", filed: "2026-02-27", val: annual2025 },
    { start: "2025-01-01", end: "2025-06-30", form: "10-Q", filed: "2025-08-01", val: ytd2025 },
  ] satisfies SecFactUnit[] },
});

const successorDuration = (value: number) => ({
  units: { USD: [
    { start: "2026-01-01", end: "2026-06-30", form: "10-Q", filed: "2026-08-03", val: value },
  ] satisfies SecFactUnit[] },
});

const oldInstant = (values: [number, number, number]) => ({
  units: { USD: [
    { end: "2023-12-31", form: "10-K", filed: "2024-02-28", val: values[0] },
    { end: "2024-12-31", form: "10-K", filed: "2025-02-28", val: values[1] },
    { end: "2025-12-31", form: "10-K", filed: "2026-02-27", val: values[2] },
  ] satisfies SecFactUnit[] },
});

const successorInstant = (value: number) => ({
  units: { USD: [{ end: "2026-06-30", form: "10-Q", filed: "2026-08-03", val: value }] satisfies SecFactUnit[] },
});

export const xomPredecessorFacts: SecCompanyFacts = {
  cik: 34088,
  entityName: "Exxon Mobil Corporation",
  facts: { "us-gaap": {
    Revenues: oldDuration(340, 350, 360, 170),
    GrossProfit: oldDuration(90, 95, 100, 48),
    OperatingIncomeLoss: oldDuration(50, 52, 55, 27),
    NetIncomeLoss: oldDuration(36, 38, 40, 19),
    NetCashProvidedByUsedInOperatingActivities: oldDuration(55, 58, 60, 29),
    PaymentsToAcquirePropertyPlantAndEquipment: oldDuration(20, 21, 22, 10),
    Assets: oldInstant([360, 370, 380]),
    Liabilities: oldInstant([180, 182, 185]),
    StockholdersEquity: oldInstant([180, 188, 195]),
    CashAndCashEquivalentsAtCarryingValue: oldInstant([30, 32, 34]),
  } },
};

export const xomSuccessorFacts: SecCompanyFacts = {
  cik: 2115436,
  entityName: "ExxonMobil Holdings Corporation",
  facts: { "us-gaap": {
    Revenues: successorDuration(190),
    GrossProfit: successorDuration(55),
    NetIncomeLoss: successorDuration(23),
    NetCashProvidedByUsedInOperatingActivities: successorDuration(35),
    PaymentsToAcquirePropertyPlantAndEquipment: successorDuration(12),
    Assets: successorInstant(400),
    Liabilities: successorInstant(190),
    StockholdersEquity: successorInstant(210),
    CashAndCashEquivalentsAtCarryingValue: successorInstant(40),
  } },
};
