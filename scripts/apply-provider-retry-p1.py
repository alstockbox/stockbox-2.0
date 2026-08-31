from pathlib import Path

path = Path("src/lib/data/provider.ts")
source = path.read_text()

old_import = 'import { providerDiagnostic, type AdapterResult, type MarketDataProvider, type ProviderFailureReason } from "./providers";'
new_import = '''import {
  executeProviderWithRetry,
  providerDiagnostic,
  type AdapterResult,
  type MarketDataProvider,
  type ProviderFailureReason,
  type ProviderRetryExecution,
} from "./providers";'''
if old_import in source:
    source = source.replace(old_import, new_import, 1)
elif new_import not in source:
    raise SystemExit("providers import anchor not found")

old_fundamentals = '''async function resolveConfiguredFundamentals(company: CompanySearchResult): Promise<FundamentalsResolution> {
  const diagnostics: ProviderDiagnostic[] = [];
  const fetchSec = async (): Promise<AdapterResult<CompanyFundamentals> | null> => {
    if (!company.cik) return null;
    try {
      return await fetchCompanyFundamentalsResult(company);
    } catch {
      return { ok: false, reason: "upstream_error", message: "SEC fundamentals failed unexpectedly.", diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "unavailable", "upstream_error") };
    }
  };
  const fetchYahoo = async (): Promise<AdapterResult<CompanyFundamentals>> => {
    try {
      return await fetchYahooFundamentalsResult(company);
    } catch {
      return { ok: false, reason: "upstream_error", message: "Yahoo fundamentals failed unexpectedly.", diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "unavailable", "upstream_error") };
    }
  };
  const [secResult, yahooResult] = await Promise.all([fetchSec(), fetchYahoo()]);
  if (secResult) {
    diagnostics.push(secResult.ok && !hasUsableFinancialPeriods(secResult.data)
      ? providerDiagnostic("SEC Companyfacts", "fundamentals", "partial", "empty_response")
      : secResult.diagnostic);
  }
  diagnostics.push(yahooResult.ok && !hasUsableFinancialPeriods(yahooResult.data)
    ? providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "partial", "empty_response")
    : yahooResult.diagnostic);
'''
new_fundamentals = '''async function resolveConfiguredFundamentals(company: CompanySearchResult): Promise<FundamentalsResolution> {
  const diagnostics: ProviderDiagnostic[] = [];
  const fetchSec = async (): Promise<ProviderRetryExecution<CompanyFundamentals> | null> => {
    if (!company.cik) return null;
    return executeProviderWithRetry({
      operation: () => fetchCompanyFundamentalsResult(company),
      exceptionResult: () => ({
        ok: false,
        reason: "upstream_error",
        message: "SEC fundamentals failed unexpectedly.",
        diagnostic: providerDiagnostic("SEC Companyfacts", "fundamentals", "unavailable", "upstream_error"),
      }),
    });
  };
  const fetchYahoo = async (): Promise<ProviderRetryExecution<CompanyFundamentals>> => executeProviderWithRetry({
    operation: () => fetchYahooFundamentalsResult(company),
    exceptionResult: () => ({
      ok: false,
      reason: "upstream_error",
      message: "Yahoo fundamentals failed unexpectedly.",
      diagnostic: providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "unavailable", "upstream_error"),
    }),
  });
  const [secExecution, yahooExecution] = await Promise.all([fetchSec(), fetchYahoo()]);
  const secResult = secExecution?.result ?? null;
  const yahooResult = yahooExecution.result;
  if (secExecution) {
    diagnostics.push(...secExecution.attempts.map((attempt) => attempt.ok && !hasUsableFinancialPeriods(attempt.data)
      ? providerDiagnostic("SEC Companyfacts", "fundamentals", "partial", "empty_response")
      : attempt.diagnostic));
  }
  diagnostics.push(...yahooExecution.attempts.map((attempt) => attempt.ok && !hasUsableFinancialPeriods(attempt.data)
    ? providerDiagnostic("Yahoo Finance fundamentals", "fundamentals", "partial", "empty_response")
    : attempt.diagnostic));
'''
if old_fundamentals in source:
    source = source.replace(old_fundamentals, new_fundamentals, 1)
elif new_fundamentals not in source:
    raise SystemExit("fundamentals retry anchor not found")

old_market_provider = '''  for (const provider of providers) {
    let result: AdapterResult<MarketSnapshot>;
    try {
      result = await provider.fetchMarketData(company);
    } catch {
      result = {
        ok: false,
        reason: "upstream_error",
        message: "The configured market-data provider failed unexpectedly.",
        diagnostic: providerDiagnostic(provider.id, "market_data", "unavailable", "upstream_error"),
      };
      console.error("Market data provider failed unexpectedly", {
        resolvedProvider: provider.id,
        symbol: company.canonicalTicker ?? company.ticker,
        reason: "upstream_error",
      });
    }
    diagnostics.push(result.diagnostic);
    if (result.ok) {'''
new_market_provider = '''  for (const provider of providers) {
    const execution = await executeProviderWithRetry({
      operation: () => provider.fetchMarketData(company),
      exceptionResult: () => {
        console.error("Market data provider failed unexpectedly", {
          resolvedProvider: provider.id,
          symbol: company.canonicalTicker ?? company.ticker,
          reason: "upstream_error",
        });
        return {
          ok: false,
          reason: "upstream_error",
          message: "The configured market-data provider failed unexpectedly.",
          diagnostic: providerDiagnostic(provider.id, "market_data", "unavailable", "upstream_error"),
        };
      },
    });
    diagnostics.push(...execution.attempts.map((attempt) => attempt.diagnostic));
    const result = execution.result;
    if (result.ok) {'''
if old_market_provider in source:
    source = source.replace(old_market_provider, new_market_provider, 1)
elif new_market_provider not in source:
    raise SystemExit("market provider retry anchor not found")

old_market_candidate = '''    let result: AdapterResult<MarketSnapshot>;
    try {
      result = await candidate.provider.fetchMarketData(company);
    } catch {
      result = {
        ok: false,
        reason: "upstream_error",
        message: "The configured market-data provider failed unexpectedly.",
        diagnostic: providerDiagnostic(candidate.label, "market_data", "unavailable", "upstream_error"),
      };
      console.error("Market data provider failed unexpectedly", {
        resolvedProvider: candidate.provider.id,
        symbol: company.canonicalTicker ?? company.ticker,
        reason: "upstream_error",
      });
    }
    diagnostics.push(result.diagnostic);
    lastResult = result;'''
new_market_candidate = '''    const execution = await executeProviderWithRetry({
      operation: () => candidate.provider!.fetchMarketData(company),
      exceptionResult: () => {
        console.error("Market data provider failed unexpectedly", {
          resolvedProvider: candidate.provider!.id,
          symbol: company.canonicalTicker ?? company.ticker,
          reason: "upstream_error",
        });
        return {
          ok: false,
          reason: "upstream_error",
          message: "The configured market-data provider failed unexpectedly.",
          diagnostic: providerDiagnostic(candidate.label, "market_data", "unavailable", "upstream_error"),
        };
      },
    });
    diagnostics.push(...execution.attempts.map((attempt) => attempt.diagnostic));
    const result = execution.result;
    lastResult = result;'''
if old_market_candidate in source:
    source = source.replace(old_market_candidate, new_market_candidate, 1)
elif new_market_candidate not in source:
    raise SystemExit("market candidate retry anchor not found")

path.write_text(source)
