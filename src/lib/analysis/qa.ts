import type { AnalysisReport, BatchQaResult, FinancialAnalysisInput, QaFlag } from "./types";

export function buildBatchQaResult(input: {
  batchId: string;
  rerunKey: string;
  report: AnalysisReport;
  analysisInput: FinancialAnalysisInput;
  providerVersions?: Record<string, string>;
  expectedEntityId?: string;
  expectedArchetype?: AnalysisReport["analysisArchetype"];
  sourceConflicts?: string[];
}): BatchQaResult {
  const { report, analysisInput } = input;
  const engine = report.engine;
  if (!engine) throw new Error("Batch QA requires the canonical engine result.");
  const flags = new Set<QaFlag>();
  if (report.dataStatus === "stale") flags.add("STALE_DATA");
  if ((report.dataCoverage ?? 0) < 0.5) flags.add("LOW_COVERAGE");
  if (input.expectedEntityId && analysisInput.company.entityId !== input.expectedEntityId) flags.add("ENTITY_MISMATCH");
  if (input.expectedArchetype && report.analysisArchetype !== input.expectedArchetype) flags.add("WRONG_ARCHETYPE");
  if (!analysisInput.company.currency && !analysisInput.market?.currency) flags.add("UNSUPPORTED_MARKET");
  if (engine.diagnostics.ttmStatus === "annual_fallback") flags.add("TTM_FALLBACK");
  if (engine.reconciliation.some((check) => check.code.includes("period") && check.status === "warning")) flags.add("PERIOD_MISMATCH");
  if (engine.reconciliation.some((check) => check.status === "warning")) flags.add("RECONCILIATION_FAIL");
  if (report.providerDiagnostics?.some((item) => item.capability === "market_data" && item.status === "unavailable")) flags.add("MARKET_PROVIDER_ERROR");
  if (["bank", "reit"].includes(report.analysisArchetype ?? "") && !analysisInput.specialized) flags.add("SPECIALIZED_DATA_MISSING");
  if (!Object.values(engine.metrics.valuation).some((value) => typeof value === "number" && Number.isFinite(value))) flags.add("VALUATION_UNAVAILABLE");
  if (report.scenarioStatus === "insufficient_data") flags.add("SCENARIO_UNSUPPORTED");
  if (input.sourceConflicts?.length) flags.add("SOURCE_CONFLICT");
  return {
    batchId: input.batchId,
    rerunKey: input.rerunKey,
    modelVersion: engine.modelVersion,
    providerVersions: input.providerVersions ?? {},
    analysisTimestamp: report.generatedAt,
    canonicalEntity: analysisInput.company.entityId ?? `listing:${report.ticker}`,
    archetype: engine.analysisArchetype,
    coverage: engine.dataCoverage,
    confidence: engine.scores.confidence,
    flags: [...flags],
  };
}
