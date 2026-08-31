import type {
  AnalysisReport,
  ResearchEvidence,
  ResearchLayerId,
  ResearchLayerStatus,
  ResearchModuleId,
  ResearchModuleResult,
} from "./types";
import { analyzeInsiderTransactions } from "./research";
import type { OfficialResearchBundle } from "@/lib/data/official-research";

const LAYER_WEIGHTS: Record<ResearchLayerId, number> = {
  fundamental: 0.2,
  valuation: 0.1,
  market: 0.1,
  filings_events: 0.1,
  earnings_expectations: 0.1,
  news_events: 0.1,
  insider_ownership: 0.08,
  industry: 0.08,
  macro: 0.05,
  geopolitical: 0.05,
  positioning: 0.04,
};

function uniqueEvidence(items: ResearchEvidence[]): ResearchEvidence[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.id}|${item.source.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function upsertLayer(layers: ResearchLayerStatus[], next: ResearchLayerStatus): void {
  const index = layers.findIndex((item) => item.layer === next.layer);
  if (index >= 0) layers[index] = next;
  else layers.push(next);
}

function upsertModule(modules: ResearchModuleResult[], next: ResearchModuleResult): void {
  const index = modules.findIndex((item) => item.id === next.id);
  if (index >= 0) modules[index] = next;
  else modules.push(next);
}

function module(
  id: ResearchModuleId,
  title: string,
  payload: {
    status: ResearchModuleResult["status"];
    coverage: number;
    confidence: number;
    dataAsOf: string | null;
    evidence: ResearchEvidence[];
    findings?: string[];
    positives?: string[];
    negatives?: string[];
    unknowns?: string[];
  },
): ResearchModuleResult {
  return {
    id,
    title,
    status: payload.status,
    coverage: payload.coverage,
    confidence: payload.confidence,
    dataAsOf: payload.dataAsOf,
    findings: (payload.findings ?? []).map((statement) => ({
      statement,
      evidenceIds: payload.evidence.map((item) => item.id),
      confidence: payload.confidence,
    })),
    positiveSignals: payload.positives ?? [],
    negativeSignals: payload.negatives ?? [],
    unknowns: payload.unknowns ?? [],
    sources: payload.evidence,
  };
}

function recomputeResearchCoverage(report: AnalysisReport): void {
  const research = report.research;
  if (!research) return;
  const weightedCoverage = research.layers.reduce(
    (sum, item) => sum + item.coverage * LAYER_WEIGHTS[item.layer],
    0,
  );
  const weightedConfidence = research.layers.reduce(
    (sum, item) => sum + item.confidence * item.coverage * LAYER_WEIGHTS[item.layer],
    0,
  );
  research.coverage = Math.min(1, Math.max(0, weightedCoverage));
  research.confidence = Math.round(Math.min(100, Math.max(0, weightedConfidence)));
}

function appendSourceProvenance(report: AnalysisReport, evidence: ResearchEvidence[]): void {
  const section = report.deepReport?.sections.find((item) => item.id === "sources_provenance");
  if (!section || !evidence.length) return;
  section.status = "available";
  section.unknowns = [];
  const existing = new Set(section.findings.flatMap((item) => item.evidenceIds));
  const additions = evidence.filter((item) => !existing.has(item.id));
  section.findings.push(...additions.map((item) => ({
    statement: `${item.title} — ${item.source.name}.`,
    evidenceIds: [item.id],
    confidence: item.sourceTier === "official_regulator" || item.sourceTier === "regulatory_filing" ? 98 : 90,
  })));
}

export function augmentWithOfficialResearch(report: AnalysisReport, bundle: OfficialResearchBundle): void {
  const research = report.research;
  if (!research) return;

  const addedEvidence = uniqueEvidence([
    ...(bundle.insider?.evidence ?? []),
    ...(bundle.positioning?.evidence ?? []),
    ...(bundle.macro?.evidence ?? []),
    ...(bundle.bolagsverket?.evidence ?? []),
  ]);
  research.evidence = uniqueEvidence([...research.evidence, ...addedEvidence]);

  if (bundle.insider) {
    const transactions = bundle.insider.data;
    const context = analyzeInsiderTransactions(transactions);
    const status = transactions.length ? "available" : "partial";
    upsertLayer(research.layers, {
      layer: "insider_ownership",
      label: "Insider / ownership",
      status,
      coverage: bundle.insider.coverage,
      confidence: bundle.insider.confidence,
      dataAsOf: bundle.insider.dataAsOf,
      evidenceIds: bundle.insider.evidence.map((item) => item.id),
      reason: transactions.length ? undefined : "The official register returned no recent matched insider transactions.",
    });
    const findings = [
      ...context.findings,
      transactions.length ? `${transactions.length} matched insider transaction${transactions.length === 1 ? "" : "s"} were reviewed from the official register.` : "No recent matched insider transaction was returned by the official register.",
    ];
    const positives = context.direction === "positive" ? context.findings : [];
    const negatives = context.direction === "negative" ? context.findings : [];
    upsertModule(research.modules, module("insider_transactions", "Insider Transactions", {
      status,
      coverage: bundle.insider.coverage,
      confidence: Math.max(bundle.insider.confidence, context.confidence),
      dataAsOf: bundle.insider.dataAsOf,
      evidence: bundle.insider.evidence,
      findings,
      positives,
      negatives,
      unknowns: transactions.length ? [] : ["No matched recent insider transaction was available; absence is not treated as a positive or negative signal."],
    }));
  }

  if (bundle.positioning) {
    const position = bundle.positioning.data;
    const status = position ? "available" : "partial";
    upsertLayer(research.layers, {
      layer: "positioning",
      label: "Positioning / short interest",
      status,
      coverage: bundle.positioning.coverage,
      confidence: bundle.positioning.confidence,
      dataAsOf: bundle.positioning.dataAsOf,
      evidenceIds: bundle.positioning.evidence.map((item) => item.id),
      reason: position ? undefined : "The issuer was not matched in the current FI aggregate short-position table.",
    });
    upsertModule(research.modules, module("ownership_positioning", "Ownership / Short Interest / Positioning", {
      status,
      coverage: bundle.positioning.coverage,
      confidence: bundle.positioning.confidence,
      dataAsOf: bundle.positioning.dataAsOf,
      evidence: bundle.positioning.evidence,
      findings: position ? [`Reported aggregate short positions equal ${position.aggregateShortPercent.toFixed(2)}% as of ${position.positionDate}.`] : [],
      unknowns: position ? ["Reported short positions cover the FI reporting regime and are not equivalent to every economically short exposure."] : ["No current aggregate FI short-position match was returned; this is not interpreted as zero short interest."],
    }));
  }

  if (bundle.macro) {
    const macro = bundle.macro.data;
    upsertLayer(research.layers, {
      layer: "macro",
      label: "Macro / risk-free benchmark",
      status: "available",
      coverage: bundle.macro.coverage,
      confidence: bundle.macro.confidence,
      dataAsOf: bundle.macro.dataAsOf,
      evidenceIds: bundle.macro.evidence.map((item) => item.id),
    });
    upsertModule(research.modules, module("macro_exposure", "Macro Exposure", {
      status: "available",
      coverage: bundle.macro.coverage,
      confidence: bundle.macro.confidence,
      dataAsOf: bundle.macro.dataAsOf,
      evidence: bundle.macro.evidence,
      findings: [`${macro.seriesLabel} was ${macro.observedYieldPercent.toFixed(3)}% on ${macro.observationDate}; StockBox uses the normalized decimal rate as a verified DCF risk-free input when the valuation model is applicable.`],
      unknowns: ["This benchmark is a valuation input, not a standalone buy/sell signal."],
    }));
  }

  if (bundle.bolagsverket) {
    const documents = bundle.bolagsverket.data.documents;
    const existing = research.layers.find((item) => item.layer === "filings_events");
    const evidenceIds = uniqueEvidence([
      ...research.evidence.filter((item) => existing?.evidenceIds.includes(item.id)),
      ...bundle.bolagsverket.evidence,
    ]).map((item) => item.id);
    upsertLayer(research.layers, {
      layer: "filings_events",
      label: "Filings / events",
      status: documents.length || existing?.status === "available" ? "available" : existing?.status ?? "partial",
      coverage: Math.max(existing?.coverage ?? 0, bundle.bolagsverket.coverage),
      confidence: Math.max(existing?.confidence ?? 0, bundle.bolagsverket.confidence),
      dataAsOf: bundle.bolagsverket.dataAsOf ?? existing?.dataAsOf ?? null,
      evidenceIds,
      reason: documents.length ? undefined : existing?.reason,
    });
    const filingModule = research.modules.find((item) => item.id === "news_material_events");
    if (filingModule && documents.length) {
      filingModule.status = "available";
      filingModule.coverage = Math.max(filingModule.coverage, bundle.bolagsverket.coverage);
      filingModule.confidence = Math.max(filingModule.confidence, bundle.bolagsverket.confidence);
      filingModule.dataAsOf = bundle.bolagsverket.dataAsOf ?? filingModule.dataAsOf;
      filingModule.sources = uniqueEvidence([...filingModule.sources, ...bundle.bolagsverket.evidence]);
      filingModule.findings.push({
        statement: `${documents.length} official digital annual-report record${documents.length === 1 ? "" : "s"} were matched at Bolagsverket.`,
        evidenceIds: bundle.bolagsverket.evidence.map((item) => item.id),
        confidence: 98,
      });
    }
  }

  recomputeResearchCoverage(report);
  appendSourceProvenance(report, addedEvidence);

  const confidenceSection = report.deepReport?.sections.find((item) => item.id === "data_confidence");
  if (confidenceSection) {
    confidenceSection.findings = [{
      statement: `Research coverage is ${(research.coverage * 100).toFixed(0)}% and confidence is ${research.confidence}% after official-source enrichment.`,
      evidenceIds: research.evidence.map((item) => item.id),
      confidence: research.confidence,
    }];
  }
}
