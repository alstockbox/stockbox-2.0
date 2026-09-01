import type { AnalysisSource, InsiderTransaction } from "@/lib/analysis/types";
import type { OfficialResearchBundle } from "@/lib/data/official-research";

export type MonitoringSignalKind = "insider" | "short_interest" | "filing";

export type MonitoringSignal = {
  kind: MonitoringSignalKind;
  hash: string;
  title: string;
  body: string;
  severity: "info" | "watch" | "important";
  dataAsOf: string | null;
  payload: Record<string, unknown>;
  sources: AnalysisSource[];
};

function stableHash(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function transactionIdentity(transaction: InsiderTransaction) {
  return {
    date: transaction.date,
    transactionType: transaction.transactionType,
    insiderRole: transaction.insiderRole ?? null,
    shares: transaction.shares ?? null,
    value: transaction.value ?? null,
    automaticPlan: transaction.automaticPlan ?? false,
  };
}

function evidenceSources(payload: { evidence: Array<{ source: AnalysisSource }> } | null): AnalysisSource[] {
  return payload?.evidence.map((item) => item.source) ?? [];
}

function insiderSignal(bundle: OfficialResearchBundle): MonitoringSignal | null {
  const transactions = bundle.insider?.data ?? [];
  if (!transactions.length) return null;
  const latest = transactions.slice(0, 20).map(transactionIdentity);
  const buys = latest.filter((item) => item.transactionType === "open_market_buy").length;
  const sells = latest.filter((item) => item.transactionType === "open_market_sell").length;
  const latestTransaction = latest[0];
  const significant = latest.some((item) => typeof item.value === "number" && item.value >= 1_000_000);
  return {
    kind: "insider",
    hash: stableHash(latest),
    title: `Insider activity changed for ${bundle.company.ticker}`,
    body: `${latestTransaction.date}: ${buys} reported buy${buys === 1 ? "" : "s"} and ${sells} reported sale${sells === 1 ? "" : "s"} are present in the latest official insider snapshot.`,
    severity: significant ? "important" : "watch",
    dataAsOf: bundle.insider?.dataAsOf ?? latestTransaction.date,
    payload: { transactions: latest, buys, sells },
    sources: evidenceSources(bundle.insider),
  };
}

function shortInterestSignal(bundle: OfficialResearchBundle): MonitoringSignal | null {
  if (!bundle.positioning) return null;
  const position = bundle.positioning.data;
  if (!position) {
    const normalized = { status: "not_listed_in_current_register", dataAsOf: bundle.positioning.dataAsOf };
    return {
      kind: "short_interest",
      hash: stableHash(normalized),
      title: `Short-interest register state changed for ${bundle.company.ticker}`,
      body: "FI currently has no matching issuer row in the aggregate short-position register. This must not be interpreted as 0% short interest.",
      severity: "info",
      dataAsOf: bundle.positioning.dataAsOf,
      payload: normalized,
      sources: evidenceSources(bundle.positioning),
    };
  }
  const normalized = {
    status: "reported",
    issuerName: position.issuerName,
    lei: position.lei,
    positionDate: position.positionDate,
    aggregateShortPercent: position.aggregateShortPercent,
  };
  return {
    kind: "short_interest",
    hash: stableHash(normalized),
    title: `Short interest changed for ${bundle.company.ticker}`,
    body: `FI reports aggregate disclosed short positioning of ${position.aggregateShortPercent.toFixed(2)}% as of ${position.positionDate}.`,
    severity: position.aggregateShortPercent >= 5 ? "important" : position.aggregateShortPercent >= 2 ? "watch" : "info",
    dataAsOf: position.positionDate,
    payload: normalized,
    sources: evidenceSources(bundle.positioning),
  };
}

function filingSignal(bundle: OfficialResearchBundle): MonitoringSignal | null {
  const documents = bundle.bolagsverket?.data.documents ?? [];
  if (!documents.length) return null;
  const latest = documents.slice(0, 10).map((document) => ({
    documentId: document.documentId,
    fileFormat: document.fileFormat,
    reportingPeriodEnd: document.reportingPeriodEnd,
    registeredAt: document.registeredAt,
  }));
  const newest = latest[0];
  return {
    kind: "filing",
    hash: stableHash(latest),
    title: `Official filing changed for ${bundle.company.ticker}`,
    body: `Bolagsverket has a new or changed digital annual-report snapshot${newest.reportingPeriodEnd ? ` for period ending ${newest.reportingPeriodEnd}` : ""}.`,
    severity: "important",
    dataAsOf: bundle.bolagsverket?.dataAsOf ?? newest.registeredAt ?? newest.reportingPeriodEnd,
    payload: { documents: latest },
    sources: evidenceSources(bundle.bolagsverket),
  };
}

export function deriveOfficialMonitoringSignals(bundle: OfficialResearchBundle): MonitoringSignal[] {
  return [insiderSignal(bundle), shortInterestSignal(bundle), filingSignal(bundle)].filter(
    (signal): signal is MonitoringSignal => signal !== null,
  );
}
