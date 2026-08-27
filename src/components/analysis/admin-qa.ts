import type { AdminQaDiagnostics } from "@/lib/analysis/types";

export type AdminQaSection = {
  label: string;
  values: string[];
};

export function adminQaSections(diagnostics: AdminQaDiagnostics | undefined): AdminQaSection[] {
  if (!diagnostics) return [];
  const classification = diagnostics.classificationDiagnostics;
  return [
    {
      label: "Provider attempts",
      values: diagnostics.providerAttempts.map((item) =>
        `${item.provider} / ${item.capability}: ${item.status}${item.reason ? ` (${item.reason})` : ""}`,
      ),
    },
    { label: "Selected providers", values: diagnostics.selectedProviders },
    {
      label: "Provider failures",
      values: diagnostics.providerFailures.map((item) =>
        `${item.provider} / ${item.capability}: ${item.reason ?? item.status}`,
      ),
    },
    { label: "Fallbacks", values: diagnostics.fallbacks },
    {
      label: "Missing data",
      values: diagnostics.missingDataReasons.map((item) => `${item.field}: ${item.reason}`),
    },
    {
      label: "Classification",
      values: classification
        ? [`${classification.reason} (${Math.round(classification.confidence * 100)}%${classification.ambiguous ? ", ambiguous" : ""})`]
        : [],
    },
    {
      label: "Source conflicts",
      values: diagnostics.sourceConflicts.map((conflict) =>
        `${conflict.severity}: ${conflict.metric}${conflict.periodEnd ? ` / ${conflict.periodEnd}` : ""} - ${conflict.reason}`,
      ),
    },
    {
      label: "Timings",
      values: Object.entries(diagnostics.timingsMs).map(([key, value]) => `${key}: ${Math.round(value)} ms`),
    },
    { label: "Currency", values: [diagnostics.currencyState] },
    { label: "Specialized coverage", values: [diagnostics.specializedCoverage === null ? "Not applicable" : `${Math.round(diagnostics.specializedCoverage * 100)}%`] },
    { label: "Valuation support", values: [diagnostics.valuationSupport] },
  ];
}
