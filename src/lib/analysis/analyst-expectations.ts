import type { AnalysisReport, ForwardEstimates } from "./types";

export type AnalystExpectationRow = {
  key: keyof ForwardEstimates;
  label: string;
  value: number | null;
  status: "available" | "unavailable";
  note: string;
};

export type AnalystExpectationsSummary = {
  status: "available" | "unavailable";
  rows: AnalystExpectationRow[];
  providerStatus: string | null;
  estimateAvailability: number | null;
  missingReasons: string[];
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function row(estimates: ForwardEstimates | undefined, key: keyof ForwardEstimates, label: string): AnalystExpectationRow {
  const value = estimates?.[key] ?? null;
  const status = finite(value) ? "available" : "unavailable";
  return {
    key,
    label,
    value,
    status,
    note: status === "available"
      ? "Forward estimate supplied by the configured estimates input."
      : "No configured estimates provider supplied this field; StockBox does not infer it from historical data.",
  };
}

export function buildAnalystExpectationsSummary(report: AnalysisReport): AnalystExpectationsSummary {
  const rows = [
    row(report.forwardEstimates, "nextYearRevenueGrowth", "Next-year revenue growth"),
    row(report.forwardEstimates, "nextYearEpsGrowth", "Next-year EPS growth"),
    row(report.forwardEstimates, "nextYearFreeCashFlowGrowth", "Next-year FCF growth"),
  ];
  const availableRows = rows.filter((item) => item.status === "available");
  const provider = report.providerDiagnostics?.find((item) => item.capability === "estimates");
  const estimateAvailability = report.confidenceBreakdown?.estimateAvailability ?? null;
  return {
    status: availableRows.length ? "available" : "unavailable",
    rows,
    providerStatus: provider ? `${provider.provider}: ${provider.status}` : null,
    estimateAvailability,
    missingReasons: rows
      .filter((item) => item.status === "unavailable")
      .map((item) => `${item.label}: estimate unavailable.`),
  };
}
