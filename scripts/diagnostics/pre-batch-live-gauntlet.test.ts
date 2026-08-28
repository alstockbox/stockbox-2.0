import { describe, expect, it } from "vitest";
import { analyzeCompany, searchCompanies } from "../../src/lib/data/provider";

const defaultQueries = [
  "AAPL",
  "MSFT",
  "JPM",
  "SEB-A.ST",
  "BRK-B",
  "O",
  "AMT",
  "XOM",
  "NEE",
  "VOLV-B.ST",
  "ASML.AS",
  "NOVO-B.CO",
  "7203.T",
  "TSM",
  "BHP.AX",
] as const;
const queries = process.env.GAUNTLET_QUERIES?.split(",").map((query) => query.trim()).filter(Boolean)
  ?? [...defaultQueries];

const directionalRatings = new Set(["Strong Buy", "Buy", "Sell", "Strong Sell"]);

function nonFiniteNumberPaths(value: unknown, path = "report"): string[] {
  if (typeof value === "number") return Number.isFinite(value) ? [] : [path];
  if (Array.isArray(value)) return value.flatMap((item, index) => nonFiniteNumberPaths(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, item]) => nonFiniteNumberPaths(item, `${path}.${key}`));
}

describe("diagnostic pre-batch live gauntlet", () => {
  it("audits the broad live provider and engine path without calibrating ratings", async () => {
    const diagnostics: unknown[] = [];
    let completed = 0;

    for (const query of queries) {
      try {
        const candidates = await searchCompanies(query);
        const normalizedQuery = query.trim().toUpperCase();
        const company = candidates.find((candidate) =>
          (candidate.canonicalTicker ?? candidate.ticker).trim().toUpperCase() === normalizedQuery
        ) ?? candidates[0];
        if (!company) {
          diagnostics.push({ query, status: "safe_failure", reason: "No canonical search result." });
          continue;
        }

        const result = await analyzeCompany({
          company,
          analysisType: "deep",
          investmentProfile: "balanced",
        });
        if (!result.ok) {
          diagnostics.push({
            query,
            status: "safe_failure",
            selectedTicker: company.canonicalTicker ?? company.ticker,
            selectedName: company.name,
            securityType: company.securityType,
            reason: result.error,
            warnings: result.warnings,
          });
          continue;
        }

        const report = result.data;
        const engine = report.engine!;
        const nonFinite = nonFiniteNumberPaths(report);
        const specializedSupport = ["bank", "insurer", "reit"].includes(engine.analysisArchetype)
          && (engine.scores.specializedCoverage?.overall ?? 0) >= 0.7
          && (engine.scores.dimensions.valuation.coverage ?? 0) >= 0.75;
        const dcfSupport = engine.dcf.status === "available" && engine.dcf.directionalSupport !== false;
        const benchmarkSupport = engine.recommendation.constraintsApplied.includes(
          "Regular directional rating uses high-coverage benchmark valuation because DCF is unavailable.",
        );

        expect(nonFinite, `${query} returned non-finite numbers`).toEqual([]);
        if (directionalRatings.has(engine.recommendation.rating)) {
          expect(dcfSupport || specializedSupport || benchmarkSupport, `${query} returned an unsupported directional rating`).toBe(true);
        }
        if (engine.analysisArchetype === "unknown") {
          expect(engine.recommendation.rating).toBe("No Rating");
        }

        completed += 1;
        diagnostics.push({
          query,
          status: "completed",
          selectedTicker: company.canonicalTicker ?? company.ticker,
          reportTicker: report.ticker,
          selectedName: company.name,
          reportName: report.companyName,
          entityId: company.entityId,
          cik: company.cik,
          securityType: company.securityType,
          archetype: engine.analysisArchetype,
          classification: engine.classificationDiagnostics,
          reportingCurrency: engine.metrics.latestPeriod?.currency ?? null,
          valuationCurrency: engine.dcf.currency ?? null,
          financialPeriod: engine.diagnostics.latestFinancialPeriodEnd,
          dataStatus: engine.dataStatus,
          coverage: engine.dataCoverage,
          confidence: engine.scores.confidence,
          score: engine.scores.stockBoxScore,
          rating: engine.recommendation.rating,
          dcfStatus: engine.dcf.status,
          dcfDirectional: engine.dcf.directionalSupport ?? false,
          specializedCoverage: engine.scores.specializedCoverage?.overall ?? null,
          sourceConflicts: engine.sourceConflicts,
          reconciliationWarnings: engine.reconciliation.filter((check) => check.status !== "pass").map((check) => check.code),
          providerDiagnostics: report.providerDiagnostics,
          sources: result.sources.map((source) => ({
            name: source.name,
            provider: source.provider,
            capability: source.capability,
            dataAsOf: source.dataAsOf,
            version: source.version,
          })),
          warnings: result.warnings,
        });
      } catch (error) {
        diagnostics.push({
          query,
          status: "safe_failure",
          reason: error instanceof Error ? error.message : "Unexpected live diagnostic failure.",
        });
      }
    }

    console.log(`PRE_BATCH_LIVE_GAUNTLET=${JSON.stringify(diagnostics)}`);
    expect(completed, "Too few live analyses completed to call the gauntlet broad")
      .toBeGreaterThanOrEqual(Math.min(10, queries.length));
  }, 600_000);
});
