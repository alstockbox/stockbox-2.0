import type { CompanyMetricSnapshot, PublicCompanyMetricSnapshot } from "./types";

export function readSnapshotMetric(snapshot: CompanyMetricSnapshot | PublicCompanyMetricSnapshot, metricKey: string): number | null {
  let current: unknown = snapshot;
  for (const part of metricKey.split(".").filter(Boolean)) {
    if (current === null || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "number" && Number.isFinite(current) ? current : null;
}
