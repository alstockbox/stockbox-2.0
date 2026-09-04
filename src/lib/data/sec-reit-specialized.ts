export type SecReitMetricKey =
  | "occupancy"
  | "sameStoreNoiGrowth"
  | "netDebtToEbitdare"
  | "fixedChargeCoverage";

export type SecReitObservation = {
  metric: SecReitMetricKey;
  value: number;
  unit: "ratio";
  dataAsOf: string | null;
  label: string;
  sourceUrl: string;
};

export type SecReitDocumentContext = {
  sourceUrl: string;
  periodEnd?: string | null;
};

export function parseSecReitSpecializedDocument(
  _html: string,
  _context: SecReitDocumentContext,
): SecReitObservation[] {
  return [];
}
