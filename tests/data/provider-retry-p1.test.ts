import { describe, expect, it } from "vitest";
import {
  executeProviderWithRetry,
  providerDiagnostic,
  shouldRetryProviderFailure,
  type AdapterResult,
} from "@/lib/data/providers";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function failure(reason: Parameters<typeof shouldRetryProviderFailure>[0]): AdapterResult<string> {
  return {
    ok: false,
    reason,
    message: reason,
    diagnostic: providerDiagnostic("test-provider", "market_data", "unavailable", reason),
  };
}

function success(value = "ok"): AdapterResult<string> {
  return {
    ok: true,
    data: value,
    diagnostic: providerDiagnostic("test-provider", "market_data", "available"),
  };
}

describe("provider retry resilience P1", () => {
  it("retries only transient provider failures", () => {
    expect(shouldRetryProviderFailure("timeout")).toBe(true);
    expect(shouldRetryProviderFailure("rate_limited")).toBe(true);
    expect(shouldRetryProviderFailure("upstream_error")).toBe(true);
    expect(shouldRetryProviderFailure("not_found")).toBe(false);
    expect(shouldRetryProviderFailure("unsupported_symbol")).toBe(false);
    expect(shouldRetryProviderFailure("impossible_price")).toBe(false);
    expect(shouldRetryProviderFailure("empty_response")).toBe(false);
  });

  it("retries a timeout once and returns the successful second attempt", async () => {
    let calls = 0;
    const execution = await executeProviderWithRetry({
      operation: async () => {
        calls += 1;
        return calls === 1 ? failure("timeout") : success("recovered");
      },
      exceptionResult: () => failure("upstream_error"),
      retryDelayMs: 0,
    });
    expect(calls).toBe(2);
    expect(execution.result).toMatchObject({ ok: true, data: "recovered" });
    expect(execution.attempts).toHaveLength(2);
    expect(execution.attempts[0]).toMatchObject({ ok: false, reason: "timeout" });
  });

  it("converts a thrown transient exception into one retry and preserves both diagnostics", async () => {
    let calls = 0;
    const execution = await executeProviderWithRetry({
      operation: async () => {
        calls += 1;
        if (calls === 1) throw new Error("temporary upstream reset");
        return success("second-attempt");
      },
      exceptionResult: () => failure("upstream_error"),
      retryDelayMs: 0,
    });
    expect(calls).toBe(2);
    expect(execution.result.ok).toBe(true);
    expect(execution.attempts.map((attempt) => attempt.diagnostic.status)).toEqual(["unavailable", "available"]);
  });

  it("does not retry terminal or validation failures", async () => {
    for (const reason of ["not_found", "unsupported_symbol", "impossible_price", "invalid_row"] as const) {
      let calls = 0;
      const execution = await executeProviderWithRetry({
        operation: async () => {
          calls += 1;
          return failure(reason);
        },
        exceptionResult: () => failure("upstream_error"),
        retryDelayMs: 0,
      });
      expect(calls).toBe(1);
      expect(execution.attempts).toHaveLength(1);
      expect(execution.result).toMatchObject({ ok: false, reason });
    }
  });

  it("caps retry behavior at two total attempts", async () => {
    let calls = 0;
    const execution = await executeProviderWithRetry({
      operation: async () => {
        calls += 1;
        return failure("rate_limited");
      },
      exceptionResult: () => failure("upstream_error"),
      retryDelayMs: 0,
    });
    expect(calls).toBe(2);
    expect(execution.attempts).toHaveLength(2);
    expect(execution.result).toMatchObject({ ok: false, reason: "rate_limited" });
  });

  it("wires retry execution into market-data and fundamentals resolution", () => {
    const providerCoreSource = readFileSync(join(process.cwd(), "src/lib/data/provider-core.ts"), "utf8");
    expect(providerCoreSource).toContain("executeProviderWithRetry");
    expect(providerCoreSource).toContain("fetchCompanyFundamentalsResult(company)");
    expect(providerCoreSource).toContain("fetchYahooFundamentalsResult(company)");
    expect(providerCoreSource).toContain("provider.fetchMarketData(company)");
    expect(providerCoreSource).toContain("candidate.provider!.fetchMarketData(company)");
  });
});
