import { describe, expect, it } from "vitest";
import { searchCompanies } from "../../src/lib/data/provider";
import { fetchYahooFundamentalsResult } from "../../src/lib/data/yahoo-fundamentals";

const liveDescribe = process.env.RUN_LIVE_COVERAGE === "1" ? describe : describe.skip;
const REIT_PROBE_TICKERS = ["ORC", "EQIX", "O", "PLD"] as const;

liveDescribe("live REIT specialized enrichment diagnostic", () => {
  it("traces exact-listing identity and nested specialist diagnostics without aborting on provider failures", async () => {
    const rows = [] as Array<Record<string, unknown>>;

    for (const ticker of REIT_PROBE_TICKERS) {
      const candidates = await searchCompanies(ticker);
      const company = candidates.find((candidate) =>
        (candidate.canonicalTicker ?? candidate.ticker).toUpperCase() === ticker
      );

      expect(company, `Expected an exact live search candidate for ${ticker}`).toBeTruthy();
      if (!company) continue;

      const result = await fetchYahooFundamentalsResult(company);
      rows.push({
        ticker,
        resolvedTicker: company.canonicalTicker ?? company.ticker,
        cik: company.cik ?? null,
        entityId: company.entityId ?? null,
        searchProviderIds: company.providerCapabilities?.providerIds ?? [],
        searchArchetypeHint: company.securityType ?? null,
        fundamentalsOk: result.ok,
        fundamentalsArchetype: result.ok ? result.data.analysisArchetype ?? null : null,
        specialistKind: result.ok ? result.data.specialized?.kind ?? null : null,
        specialistDiagnostics: result.ok
          ? (result.data.diagnostics?.providerDiagnostics ?? []).filter((item) => item.capability === "specialized")
          : [],
        topLevelDiagnostic: result.diagnostic,
        failureReason: result.ok ? null : result.reason,
      });
    }

    console.log(`REIT_SPECIALIZED_DIAGNOSTIC ${JSON.stringify(rows)}`);
    expect(rows).toHaveLength(REIT_PROBE_TICKERS.length);
  }, 120_000);
});
