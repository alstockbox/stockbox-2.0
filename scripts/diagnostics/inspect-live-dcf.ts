import { analyzeCompany, searchCompanies } from "../../src/lib/data/provider";

const queries = process.argv.slice(2);

(async () => {
  for (const query of queries) {
    const candidates = await searchCompanies(query);
    const normalized = query.trim().toUpperCase();
    const company = candidates.find((candidate) =>
      (candidate.canonicalTicker ?? candidate.ticker).trim().toUpperCase() === normalized
    ) ?? candidates[0];
    if (!company) {
      console.log(JSON.stringify({ query, status: "not_found" }));
      continue;
    }
    const result = await analyzeCompany({ company, analysisType: "summary", investmentProfile: "balanced" });
    if (!result.ok) {
      console.log(JSON.stringify({ query, status: "error", error: result.error }));
      continue;
    }
    const report = result.data;
    const engine = report.engine!;
    console.log(JSON.stringify({
      query,
      ticker: report.ticker,
      dcfStatus: engine.dcf.status,
      dcfReason: engine.dcf.reason,
      dcfMissing: engine.dcf.missingData,
      marketCap: engine.metrics.valuation.marketCap,
      netDebt: engine.metrics.ratios.netDebt,
      reportingCurrency: engine.metrics.latestPeriod?.currency ?? null,
      diagnostics: engine.diagnostics,
      providerDiagnostics: report.providerDiagnostics,
    }));
  }
})();
