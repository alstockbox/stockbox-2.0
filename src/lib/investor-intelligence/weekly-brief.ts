import type { CompanyMetricSnapshot, Materiality, ThesisStatus } from "./types";

export type WeeklyBriefChange = {
  ticker: string;
  metricKey: string;
  materiality: Materiality;
  reasoning: string;
  createdAt: string;
};

export type WeeklyBriefThesisAlert = {
  ticker: string;
  title: string;
  status: ThesisStatus;
  newlyFailed: string[];
};

export type WeeklyBriefInput = {
  now?: Date;
  changes: WeeklyBriefChange[];
  thesisAlerts: WeeklyBriefThesisAlert[];
  alertEvents: Array<{ ticker?: string; metricKey: string; reason?: string; triggeredAt: string }>;
  snapshots: CompanyMetricSnapshot[];
  portfolioTickers: string[];
  watchlistTickers: string[];
  screenerMatches: Array<{ ticker: string; screenerName: string }>;
  earnings: Array<{ ticker: string; date: string; label?: string }>;
  estimateRevisions: Array<{ ticker: string; metric: string; direction: "up" | "down"; change: number | null }>;
  dividendEvents: Array<{ ticker: string; kind: "increase" | "cut" | "declared"; value?: number | null }>;
};

function priority(materiality: Materiality) {
  if (materiality === "THESIS_CHANGING") return 3;
  if (materiality === "IMPORTANT") return 2;
  if (materiality === "MINOR") return 1;
  return 0;
}

export function buildWeeklyInvestorBrief(input: WeeklyBriefInput) {
  const now = input.now ?? new Date();
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const periodStart = new Date(periodEnd);
  periodStart.setUTCDate(periodStart.getUTCDate() - 6);

  const mostImportantChanges = [...input.changes]
    .filter((change) => priority(change.materiality) >= 2)
    .sort((a, b) => priority(b.materiality) - priority(a.materiality) || Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 12);

  const portfolioSet = new Set(input.portfolioTickers);
  const watchlistSet = new Set(input.watchlistTickers);
  const portfolioRisks = mostImportantChanges.filter((change) => portfolioSet.has(change.ticker));
  const watchlistOpportunities = input.snapshots
    .filter((snapshot) => watchlistSet.has(snapshot.ticker))
    .filter((snapshot) => (snapshot.fairValueUpside ?? 0) > 0 || (snapshot.valuation.historicalPePercentile ?? 1) <= 0.25)
    .sort((a, b) => (b.fairValueUpside ?? Number.NEGATIVE_INFINITY) - (a.fairValueUpside ?? Number.NEGATIVE_INFINITY))
    .slice(0, 10)
    .map((snapshot) => ({
      ticker: snapshot.ticker,
      companyName: snapshot.companyName,
      fairValueUpside: snapshot.fairValueUpside,
      historicalPePercentile: snapshot.valuation.historicalPePercentile,
      score: snapshot.score,
      capturedAt: snapshot.capturedAt,
    }));

  const thesisAlerts = input.thesisAlerts
    .filter((item) => item.status === "WATCH" || item.status === "WEAKENING" || item.status === "BROKEN" || item.newlyFailed.length > 0)
    .slice(0, 12);

  const companiesWorthReviewing = [...new Set([
    ...thesisAlerts.map((item) => item.ticker),
    ...mostImportantChanges.map((item) => item.ticker),
    ...input.alertEvents.map((item) => item.ticker).filter((ticker): ticker is string => Boolean(ticker)),
  ])].slice(0, 15);

  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10),
    mostImportantChanges,
    watchlistOpportunities,
    portfolioRisks,
    thesisAlerts,
    earningsAhead: input.earnings,
    estimateRevisions: input.estimateRevisions,
    dividendEvents: input.dividendEvents,
    newScreenerMatches: input.screenerMatches,
    alertEvents: input.alertEvents,
    companiesWorthReviewing,
    provenance: {
      changes: "material_changes",
      thesis: "investment_thesis_evaluations",
      alerts: "alert_events",
      snapshots: "company_metric_snapshots",
      portfolio: "holdings",
      watchlist: "watchlists",
      unsupportedSectionsRemainEmpty: true,
    },
  };
}
