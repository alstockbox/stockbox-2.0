import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AnalysisReport, CompanySearchResult, ProviderDiagnostic, ScoreDimensionKey } from "../../src/lib/analysis/types";
import { findExactBatchCompany, mapWithConcurrency, parseBatchInput } from "../../src/lib/batch/input";
import { analyzeCompany, searchCompanies } from "../../src/lib/data/provider";
import { yahooMarketDataProvider } from "../../src/lib/data/yahoo-market";
import {
  type BatchRootCause,
  classifyAnalysisFailure,
  isBalanceSheetFreshnessGap,
  isHistoricalComparabilityGap,
  isNonPositiveMetricLimit,
  isTtmOrPeriodGap,
  noExactMatchRootCauses,
  providerFailureRootCause,
  providerDiagnosticRootCauses,
  reportRootCauses,
  symbolNotFoundRootCauses,
} from "./user-large-ticker-classification";

const rawTickers = `
FRSH, UEIC, JACO, SPRS, PRO, MKSI, HUBS, EGAN, MAXD, PDFS, WIRX, UCTT, CNTM, PRKR, FI, UTRX, BDC, WSTL, TDC, ELST, BELFB, INLX, CVLT, PPMH, TKCI, VHC, ENTG, SPDC, DIOD, KN, CSCO.BA, MTSI, MCHP, AMBA, POWI, CDNS, OSIS, SMRT, KTCC, BHE, GEN, VRNS, ILXP, APPS, CLFD, NVEC, CLRO, BLBX, RAC.F, ETCIA, XRX, ASTC, LDOS, VIDE, DAVE, FORM, SPI, ALOT, ANSS, VRNT, IOT, LTEC, CSGS, MLNK, SMCI, MFON, RMBS, DMRC, S, SYNA, FCUV, WEX, MSN, AGYS, BOX, IWSY, CTXV, SYPT, AKTS, SSNC, FALC, MEI, CATG, CGNX, WRAP, VSH, DEMO, LITE, ASPT, DDDX, HZHI, ACLS, AVRI, WK, TSLX, SWKH, 0GV.F, ADIA, NXN, CBCYB, HTGC, CCBG, ETER, TSI, FCAP, NCA, CFBK, CHCO, DHIL, NOM, HPI, AIZ, CCFN, HALL, BRKL, RMTN, CIA, PFBN, RBAZ, AXP, NDEV, PFBX, NKSH, CXCQ, BCBP, MSCI, FSGB, TYFG, RMT, BCSO, PRAA, RM, BANX, HMN, SAR, BIT, RBCAA, MBI, PNF, HMLN, CYFL, TRV, BLE, SSB, THVB, NBTB, JQC, TRST, FSRL, RGT, NAZ, GUT, BCV, SCBS, CNO, SUND, EXSR, TY, FNF, CHBH, ANAS, OFSI, IHAI, TYBT, KTHN, RILY, CHY, AFNL, ITPC, MVBF, PMHG, CXE, HYT, AMG, FCOB, PDI, GVYB, ATLC, WHCA, ALTI, CBOE, EVM, BENH, SFST, BAC, PML, BLW, BTCS, OCNB, WAFD, COLB, MCBK, NKX, CBWA, TWN, FFC, ANDC, PPAL, BGI-UN.TO, HUML, HVLM, UBAB, MC, NIMU, ACMTA, SOUL, FNB, GRX, ETX, IRNS, SRNN, CZNL, CVHL, ASA, ADX, BTT, PRU, TRY.F, CCD, FFBC, 36Z.F, CYBA, EDD, NBN, HAON, PGP, RCG, AMBC, ICE, GSBD, FBP, UNIB, BANC, USA, SNLC, NXP, ESBS, PLCE, MAJJ, GTIM, CHDN, PCE1.DE, CLY.F, MUSA, WWW, MOV, CTHR, AVEW, BOOT, HRB, W, BWMG, GME, ZUMZ, TILE, OESX, GEF-B, SBH, STRT, BJRI, ALYI, HZO, DXYN, ALSN, LIVE, AXL, ROL, CATO, LOGC, DIL1.F, GCFB, CRMT, NCLH, NTRP, IBP, CART
`;

function loadAuditTickerSource(): { source: string; raw: string } {
  const tickerFile = process.env.STOCKBOX_TICKER_FILE?.trim();
  if (!tickerFile) return { source: "embedded-release-hardening-list", raw: rawTickers };
  return {
    source: tickerFile,
    raw: readFileSync(tickerFile, "utf8"),
  };
}

type TickerAudit = {
  query: string;
  status: "completed" | "input_invalid" | "not_found" | "no_exact_match" | "unsupported" | "provider_data_unavailable" | "provider_failure" | "analysis_engine_error";
  rootCauses: BatchRootCause[];
  selectedCompany: Pick<CompanySearchResult, "ticker" | "canonicalTicker" | "name" | "country" | "exchange" | "securityType" | "providerCapabilities" | "analysisCapability"> | null;
  candidateCount: number;
  candidateSymbols: string[];
  error?: string;
  warnings: string[];
  providerDiagnostics: ProviderDiagnostic[];
  report?: {
    ticker: string;
    companyName: string;
    archetype: string | null;
    score: number | null;
    rating: string;
    confidence: number;
    dataCoverage: number | null;
    dataStatus: string | null;
    currencyAlignment: string | null;
    dimensions: Partial<Record<ScoreDimensionKey, {
      score: number | null;
      coverage: number | null;
      missing: string[];
    }>>;
    missingData: Array<{ field: string; reason: string; impact: string; severity: string }>;
    sourceConflicts: Array<{ metric: string; severity: string; reason: string }>;
    fallbacks: string[];
  };
};

type AuditExample = {
  query: string;
  ticker: string | null;
  name: string | null;
  archetype: string | null;
  status: TickerAudit["status"];
};

type MissingDataSummary = {
  field: string;
  count: number;
  reasons: Record<string, number>;
  impacts: Record<string, number>;
  severities: Record<string, number>;
  archetypes: Record<string, number>;
  examples: Array<AuditExample & { reason: string }>;
};

type ProviderFailureDiagnosticSummary = {
  provider: string;
  capability: ProviderDiagnostic["capability"];
  status: ProviderDiagnostic["status"];
  reason: string;
  count: number;
  resultStatuses: Record<string, number>;
  examples: AuditExample[];
};

const tempDirs: string[] = [];

afterEach(() => {
  delete process.env.STOCKBOX_TICKER_FILE;
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function summarizedCompany(company: CompanySearchResult | null): TickerAudit["selectedCompany"] {
  if (!company) return null;
  return {
    ticker: company.ticker,
    canonicalTicker: company.canonicalTicker,
    name: company.name,
    country: company.country,
    exchange: company.exchange,
    securityType: company.securityType,
    providerCapabilities: company.providerCapabilities,
    analysisCapability: company.analysisCapability,
  };
}

function dimensionSummary(report: AnalysisReport): NonNullable<TickerAudit["report"]>["dimensions"] {
  if (!report.engine) return {};
  return Object.fromEntries(Object.entries(report.engine.scores.dimensions).map(([key, dimension]) => [
    key,
    {
      score: dimension.score,
      coverage: dimension.coverage ?? null,
      missing: dimension.contributors
        ?.filter((item) => item.availability === "missing")
        .map((item) => item.label) ?? [],
    },
  ])) as NonNullable<TickerAudit["report"]>["dimensions"];
}

function reportSummary(report: AnalysisReport): TickerAudit["report"] {
  const engine = report.engine;
  return {
    ticker: report.ticker,
    companyName: report.companyName,
    archetype: report.analysisArchetype ?? engine?.analysisArchetype ?? null,
    score: report.score.score,
    rating: report.recommendation,
    confidence: report.score.confidence,
    dataCoverage: report.dataCoverage ?? engine?.dataCoverage ?? null,
    dataStatus: report.dataStatus ?? engine?.dataStatus ?? null,
    currencyAlignment: engine?.currencyAlignment ?? null,
    dimensions: dimensionSummary(report),
    missingData: engine?.missingData ?? [],
    sourceConflicts: engine?.sourceConflicts.map((item) => ({ metric: item.metric, severity: item.severity, reason: item.reason })) ?? [],
    fallbacks: report.adminQa?.fallbacks ?? [],
  };
}

function exactTickerLikeQuery(query: string): boolean {
  return /^[A-Z0-9][A-Z0-9.-]{0,24}$/i.test(query.trim()) && !query.includes(" ");
}

async function noExactMatchProviderDiagnostics(query: string): Promise<ProviderDiagnostic[]> {
  if (!exactTickerLikeQuery(query)) return [];
  const symbol = query.trim().toUpperCase();
  const result = await yahooMarketDataProvider.fetchMarketData({
    ticker: symbol,
    canonicalTicker: symbol,
    name: symbol,
  });
  return [result.diagnostic];
}

async function auditTicker(query: string): Promise<TickerAudit> {
  try {
    const candidates = await searchCompanies(query);
    const exact = findExactBatchCompany(query, candidates);
    if (!candidates.length) {
      const providerDiagnostics = await noExactMatchProviderDiagnostics(query);
      return {
        query,
        status: "not_found",
        rootCauses: symbolNotFoundRootCauses(query, providerDiagnostics),
        selectedCompany: null,
        candidateCount: 0,
        candidateSymbols: [],
        warnings: [],
        providerDiagnostics,
      };
    }
    if (!exact) {
      const providerDiagnostics = await noExactMatchProviderDiagnostics(query);
      return {
        query,
        status: "no_exact_match",
        rootCauses: noExactMatchRootCauses(query, candidates, providerDiagnostics),
        selectedCompany: summarizedCompany(candidates[0] ?? null),
        candidateCount: candidates.length,
        candidateSymbols: candidates.map((item) => item.canonicalTicker ?? item.ticker),
        warnings: ["No exact canonical/provider ticker match was selected for analysis."],
        providerDiagnostics,
      };
    }

    const result = await analyzeCompany({ company: exact, analysisType: "deep", investmentProfile: "balanced" });
    const candidateSymbols = candidates.map((item) => item.canonicalTicker ?? item.ticker);
    if (!result.ok) {
      const classification = classifyAnalysisFailure(result.error, exact, result.providerDiagnostics);
      return {
        query,
        status: classification.status,
        rootCauses: classification.rootCauses,
        selectedCompany: summarizedCompany(exact),
        candidateCount: candidates.length,
        candidateSymbols,
        error: result.error,
        warnings: result.warnings,
        providerDiagnostics: result.providerDiagnostics,
      };
    }

    return {
      query,
      status: "completed",
      rootCauses: [...new Set([...reportRootCauses(result.data), ...providerDiagnosticRootCauses(result.data.adminQa?.providerAttempts ?? [])])],
      selectedCompany: summarizedCompany(exact),
      candidateCount: candidates.length,
      candidateSymbols,
      warnings: result.warnings,
      providerDiagnostics: result.data.adminQa?.providerAttempts ?? [],
      report: reportSummary(result.data),
    };
  } catch (error) {
    return {
      query,
      status: "analysis_engine_error",
      rootCauses: ["analysis_engine_error"],
      selectedCompany: null,
      candidateCount: 0,
      candidateSymbols: [],
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      warnings: [],
      providerDiagnostics: [],
    };
  }
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function sortedCounts<T extends string>(counts: Record<T, number>): Record<T, number> {
  return Object.fromEntries(
    Object.entries(counts).sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      Number(rightValue) - Number(leftValue) || leftKey.localeCompare(rightKey)
    ),
  ) as Record<T, number>;
}

function countBy<T extends string>(items: T[]): Record<T, number> {
  const counts = {} as Record<T, number>;
  for (const item of items) counts[item] = (counts[item] ?? 0) + 1;
  return sortedCounts(counts);
}

function auditExample(item: TickerAudit): AuditExample {
  return {
    query: item.query,
    ticker: item.report?.ticker ?? item.selectedCompany?.canonicalTicker ?? item.selectedCompany?.ticker ?? null,
    name: item.report?.companyName ?? item.selectedCompany?.name ?? null,
    archetype: item.report?.archetype ?? null,
    status: item.status,
  };
}

function archetypeBucket(item: TickerAudit): string {
  return item.report?.archetype ?? "unresolved";
}

function countNestedByArchetype(
  results: TickerAudit[],
  values: (item: TickerAudit) => string[],
): Record<string, Record<string, number>> {
  const byArchetype: Record<string, Record<string, number>> = {};
  for (const item of results) {
    const bucket = archetypeBucket(item);
    byArchetype[bucket] ??= {};
    for (const value of values(item)) increment(byArchetype[bucket], value);
  }
  return Object.fromEntries(
    Object.entries(byArchetype)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, counts]) => [key, sortedCounts(counts)]),
  );
}

function topMissingData(results: TickerAudit[], limit = 50): MissingDataSummary[] {
  const groups = new Map<string, MissingDataSummary>();
  for (const item of results) {
    if (item.status !== "completed" || !item.report) continue;
    const example = auditExample(item);
    const countedFields = new Set<string>();
    const countedReasons = new Set<string>();
    for (const missing of item.report.missingData) {
      const field = missing.field.trim() || "Unknown field";
      const group = groups.get(field) ?? {
        field,
        count: 0,
        reasons: {},
        impacts: {},
        severities: {},
        archetypes: {},
        examples: [],
      };
      const fieldTickerKey = `${item.query}\u0000${field}`;
      if (!countedFields.has(fieldTickerKey)) {
        group.count += 1;
        countedFields.add(fieldTickerKey);
        increment(group.archetypes, item.report.archetype ?? "unknown");
        if (group.examples.length < 8) group.examples.push({ ...example, reason: missing.reason });
      }
      const reasonKey = `${fieldTickerKey}\u0000${missing.reason}`;
      if (!countedReasons.has(reasonKey)) {
        increment(group.reasons, missing.reason || "unspecified");
        increment(group.impacts, missing.impact || "unspecified");
        increment(group.severities, missing.severity || "unspecified");
        countedReasons.add(reasonKey);
      }
      groups.set(field, group);
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      reasons: sortedCounts(group.reasons),
      impacts: sortedCounts(group.impacts),
      severities: sortedCounts(group.severities),
      archetypes: sortedCounts(group.archetypes),
    }))
    .sort((left, right) => right.count - left.count || left.field.localeCompare(right.field))
    .slice(0, limit);
}

function providerFailureDiagnostics(results: TickerAudit[], limit = 50): ProviderFailureDiagnosticSummary[] {
  const groups = new Map<string, ProviderFailureDiagnosticSummary>();
  for (const item of results) {
    for (const diagnostic of item.providerDiagnostics.filter((entry) => entry.status !== "available")) {
      const reason = diagnostic.reason ?? "unspecified";
      const key = [
        diagnostic.provider,
        diagnostic.capability,
        diagnostic.status,
        reason,
      ].join("\u0000");
      const group = groups.get(key) ?? {
        provider: diagnostic.provider,
        capability: diagnostic.capability,
        status: diagnostic.status,
        reason,
        count: 0,
        resultStatuses: {},
        examples: [],
      };
      group.count += 1;
      increment(group.resultStatuses, item.status);
      if (group.examples.length < 8) group.examples.push(auditExample(item));
      groups.set(key, group);
    }
  }

  return [...groups.values()]
    .map((group) => ({ ...group, resultStatuses: sortedCounts(group.resultStatuses) }))
    .sort((left, right) =>
      right.count - left.count
      || left.provider.localeCompare(right.provider)
      || left.capability.localeCompare(right.capability)
      || left.reason.localeCompare(right.reason)
    )
    .slice(0, limit);
}

function auditErrors(results: TickerAudit[], status: TickerAudit["status"]): Array<AuditExample & { error: string | null }> {
  return results
    .filter((item) => item.status === status)
    .map((item) => ({ ...auditExample(item), error: item.error ?? null }));
}

describe("User large ticker diagnostic classification", () => {
  it("loads an external ticker file as data when STOCKBOX_TICKER_FILE is set", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "stockbox-tickers-"));
    tempDirs.push(dir);
    const file = resolve(dir, "tickers.txt");
    writeFileSync(file, "VOLV-B.ST, SEB-A.ST\n");
    process.env.STOCKBOX_TICKER_FILE = file;

    expect(loadAuditTickerSource()).toEqual({
      source: file,
      raw: "VOLV-B.ST, SEB-A.ST\n",
    });
  });

  it("does not classify generic selected-period score gaps as TTM period gaps", () => {
    expect(isTtmOrPeriodGap({
      field: "Interest coverage",
      reason: "Interest expense is missing or not separately reported for the selected coverage period.",
    })).toBe(false);
    expect(isTtmOrPeriodGap({
      field: "balance_sheet_freshness",
      reason: "Balance-sheet facts are 91 days older than the TTM flow endpoint.",
    })).toBe(false);
    expect(isBalanceSheetFreshnessGap({
      field: "balance_sheet_freshness",
      reason: "Balance-sheet facts are 91 days older than the TTM flow endpoint.",
    })).toBe(true);
    expect(isTtmOrPeriodGap({
      field: "FCF growth TTM YoY",
      reason: "FCF growth is not meaningful when prior TTM FCF is non-positive.",
    })).toBe(false);
    expect(isTtmOrPeriodGap({
      field: "EPS CAGR 3Y",
      reason: "Comparable latest and three-year-prior annual periods are required for EPS CAGR.",
    })).toBe(false);
  });

  it("classifies history gaps and non-positive metric limits separately", () => {
    expect(isHistoricalComparabilityGap({
      field: "Revenue CAGR 3Y",
      reason: "Revenue CAGR 3Y requires comparable latest and three-year-prior annual periods.",
    })).toBe(true);
    expect(isNonPositiveMetricLimit({
      field: "P/E",
      reason: "P/E is not meaningful when common earnings are non-positive.",
    })).toBe(true);
    expect(isNonPositiveMetricLimit({
      field: "baseFcff",
      reason: "Positive FCFF is required for an FCFF DCF.",
    })).toBe(true);
    expect(isTtmOrPeriodGap({
      field: "baseFcff",
      reason: "Positive FCFF is required for an FCFF DCF.",
    })).toBe(false);
  });

  it("separates provider data gaps from generic provider failures", () => {
    expect(providerFailureRootCause("Fundamental data is unavailable for this company.")).toBe("provider_data_unavailable");
    expect(providerFailureRootCause("Yahoo Finance fundamentals request failed with HTTP 503.")).toBe("provider_failure");
  });
});

describe("User large ticker live audit", () => {
  it("captures classified per-ticker diagnostics for the requested release-hardening list", async () => {
    const tickerSource = loadAuditTickerSource();
    const parsed = parseBatchInput(tickerSource.raw);
    const offset = envNumber("STOCKBOX_BATCH_OFFSET", 0);
    const limit = envNumber("STOCKBOX_BATCH_LIMIT", parsed.symbols.length);
    const concurrency = Math.max(1, envNumber("STOCKBOX_BATCH_CONCURRENCY", 2));
    const queries = parsed.symbols.slice(offset, offset + limit);
    const startedAt = new Date().toISOString();
    const results = await mapWithConcurrency(queries, concurrency, (query) => auditTicker(query));
    const completed = results.filter((item) => item.status === "completed");
    const coverageValues = completed
      .map((item) => item.report?.dataCoverage)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const qualityAvailable = completed.filter((item) => item.report?.dimensions.quality?.score !== null).length;
    const valuationAvailable = completed.filter((item) => item.report?.dimensions.valuation?.score !== null).length;
    const allRootCauses = results.flatMap((item) => item.rootCauses);
    const output = {
      generatedAt: new Date().toISOString(),
      startedAt,
      offset,
      limit,
      concurrency,
      source: tickerSource.source,
      totalInput: parsed.symbols.length,
      duplicates: parsed.duplicates,
      invalid: parsed.invalid,
      results,
      summary: {
        statuses: countBy(results.map((item) => item.status)),
        rootCauses: countBy(allRootCauses),
        statusByArchetype: countNestedByArchetype(results, (item) => [item.status]),
        rootCausesByArchetype: countNestedByArchetype(results, (item) => item.rootCauses),
        topMissingData: topMissingData(results),
        providerFailureDiagnostics: providerFailureDiagnostics(results),
        providerFailures: results.filter((item) => item.status === "provider_failure").length,
        analysisEngineErrorCount: results.filter((item) => item.status === "analysis_engine_error").length,
        analysisEngineErrors: auditErrors(results, "analysis_engine_error"),
        unsupportedSymbols: auditErrors(results, "unsupported"),
        noExactMatchSymbols: auditErrors(results, "no_exact_match"),
        completed: completed.length,
        averageCoverage: coverageValues.length ? coverageValues.reduce((sum, value) => sum + value, 0) / coverageValues.length : null,
        qualityAvailable,
        valuationAvailable,
      },
    };

    const outputDir = resolve(process.cwd(), ".stockbox-diagnostics");
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(
      resolve(outputDir, `user-large-ticker-audit-${offset}-${limit}.json`),
      JSON.stringify(output, null, 2),
    );

    expect(output.summary).toEqual(expect.objectContaining({
      statusByArchetype: expect.any(Object),
      rootCausesByArchetype: expect.any(Object),
      topMissingData: expect.any(Array),
      providerFailureDiagnostics: expect.any(Array),
      providerFailures: expect.any(Number),
      analysisEngineErrorCount: expect.any(Number),
      analysisEngineErrors: expect.any(Array),
      unsupportedSymbols: expect.any(Array),
      noExactMatchSymbols: expect.any(Array),
    }));
    expect(results).toHaveLength(queries.length);
  }, 1_800_000);
});
