import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeAnalyticsProperties } from "@/lib/analytics/events";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("analysis observability P1", () => {
  it("keeps provider degradation telemetry low-cardinality and drops raw errors", () => {
    const event = "provider_degraded" as Parameters<typeof sanitizeAnalyticsProperties>[0];
    expect(sanitizeAnalyticsProperties(event, {
      provider: "yahoo-chart",
      capability: "market_data",
      status: "unavailable",
      rawError: "upstream response with user-specific details",
    })).toEqual({
      provider: "yahoo-chart",
      capability: "market_data",
      status: "unavailable",
    });
  });

  it("captures requested-vs-actual historical coverage without raw payloads", () => {
    const event = "historical_coverage_partial" as Parameters<typeof sanitizeAnalyticsProperties>[0];
    expect(sanitizeAnalyticsProperties(event, {
      ticker: "AAPL",
      financialStatus: "partial",
      financialYears: 6.2,
      priceStatus: "full",
      priceYears: 10,
      valuationStatus: "partial",
      valuationYears: 4.8,
      dividendStatus: "partial",
      dividendYears: 7.1,
      report: { shouldNeverLeak: true },
    })).toEqual({
      ticker: "AAPL",
      financialStatus: "partial",
      financialYears: 6.2,
      priceStatus: "full",
      priceYears: 10,
      valuationStatus: "partial",
      valuationYears: 4.8,
      dividendStatus: "partial",
      dividendYears: 7.1,
    });
  });

  it("wires provider health persistence and historical degradation signals into the analysis route", () => {
    const route = read("src/app/api/analysis/route.ts");
    const repositories = read("src/lib/db/repositories.ts");

    expect(route).toContain("recordProviderDiagnostics");
    expect(route).toContain('captureServerEvent("provider_degraded"');
    expect(route).toContain('captureServerEvent("historical_coverage_partial"');
    expect(route).toContain('captureServerEvent("historical_valuation_unavailable"');
    expect(repositories).toContain("export async function recordProviderDiagnostics");
    expect(repositories).toContain('.from("provider_health")');
  });
});
