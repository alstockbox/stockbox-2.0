import type { AnalysisReport, ProviderDiagnostic } from "@/lib/analysis/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureServerEvent } from "./events";

const PROVIDER_FAILURE_CLASSES = new Set([
  "not_configured",
  "unsupported_symbol",
  "timeout",
  "rate_limited",
  "upstream_error",
  "empty_response",
  "unexpected_content_type",
  "unexpected_columns",
  "html_response",
  "invalid_row",
  "future_date",
  "impossible_price",
  "not_found",
]);

function providerErrorClass(diagnostic: ProviderDiagnostic): string | null {
  if (diagnostic.status === "available") return null;
  const reason = diagnostic.reason?.trim().toLowerCase();
  return reason && PROVIDER_FAILURE_CLASSES.has(reason) ? reason : diagnostic.status;
}

export async function recordProviderDiagnostics(
  diagnostics: ProviderDiagnostic[],
  operation = "analysis",
) {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false as const, reason: "not_configured" as const };

  const rows = diagnostics
    .filter((diagnostic) => diagnostic.status !== "unsupported")
    .map((diagnostic) => ({
      provider: diagnostic.provider.slice(0, 80),
      operation: `${operation}:${diagnostic.capability}`.slice(0, 120),
      ok: diagnostic.status === "available",
      latency_ms: null,
      status_code: null,
      error_class: providerErrorClass(diagnostic),
    }));

  if (!rows.length) return { ok: true as const, count: 0 };
  const { error } = await supabase.from("provider_health").insert(rows);
  if (error) return { ok: false as const, reason: "insert_failed" as const };
  return { ok: true as const, count: rows.length };
}

export async function recordAnalysisObservability(input: {
  userId: string;
  report: AnalysisReport;
}) {
  const diagnostics = input.report.providerDiagnostics ?? [];
  await recordProviderDiagnostics(diagnostics);

  for (const diagnostic of diagnostics) {
    if (diagnostic.status !== "partial" && diagnostic.status !== "unavailable") continue;
    captureServerEvent("provider_degraded", {
      userId: input.userId,
      provider: diagnostic.provider,
      capability: diagnostic.capability,
      status: diagnostic.status,
    });
  }

  const coverage = input.report.historical?.coverage;
  if (!coverage) return;

  const tracked = [coverage.financials, coverage.price, coverage.valuation, coverage.dividend];
  if (tracked.some((item) => item.status === "partial" || item.status === "unavailable")) {
    captureServerEvent("historical_coverage_partial", {
      userId: input.userId,
      ticker: input.report.ticker,
      financialStatus: coverage.financials.status,
      financialYears: coverage.financials.availableYears,
      priceStatus: coverage.price.status,
      priceYears: coverage.price.availableYears,
      valuationStatus: coverage.valuation.status,
      valuationYears: coverage.valuation.availableYears,
      dividendStatus: coverage.dividend.status,
      dividendYears: coverage.dividend.availableYears,
    });
  }

  if (coverage.valuation.status === "unavailable") {
    captureServerEvent("historical_valuation_unavailable", {
      userId: input.userId,
      ticker: input.report.ticker,
      valuationYears: coverage.valuation.availableYears,
      valuationObservations: coverage.valuation.observationCount,
    });
  }
}
