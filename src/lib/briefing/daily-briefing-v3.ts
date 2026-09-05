import type { AnalysisAlertKindV3, AnalysisAlertSeverityV3 } from "@/lib/alerts/analysis-alerts-v3";

export const DAILY_BRIEFING_V3_POLICY_VERSION = "stockbox-daily-briefing-v3.0.0" as const;

export type DailyBriefingStockBoxFactV3 = {
  source: "stockbox_alert";
  sourceId: string;
  ticker: string;
  kind: AnalysisAlertKindV3;
  severity: AnalysisAlertSeverityV3;
  messageKey: string;
  payload: Record<string, unknown>;
  observedAt: string;
};

export type DailyBriefingOfficialFactV3 = {
  source: "official_monitoring";
  sourceId: string;
  ticker: string;
  kind: "insider" | "short_interest" | "filing";
  severity: "info" | "watch" | "important";
  dataAsOf: string | null;
  observedAt: string;
};

export type DailyBriefingPortfolioFactV3 = {
  source: "portfolio_snapshot";
  sourceId: string;
  portfolioId: string;
  baseCurrency: string;
  portfolioValue: number | null;
  investedCapital: number | null;
  unrealizedPl: number | null;
  unrealizedPlPercent: number | null;
  portfolioScore: number | null;
  riskScore: number | null;
  diversificationScore: number | null;
  completeValuation: boolean | null;
  observedAt: string;
};

export type DailyBriefingFactV3 =
  | DailyBriefingStockBoxFactV3
  | DailyBriefingOfficialFactV3
  | DailyBriefingPortfolioFactV3;

export type DailyBriefingV3 = {
  policyVersion: typeof DAILY_BRIEFING_V3_POLICY_VERSION;
  windowStart: string;
  factsThrough: string;
  hours: number;
  facts: DailyBriefingFactV3[];
  counts: {
    important: number;
    stockbox: number;
    official: number;
    portfolio: number;
  };
  hasMaterialChanges: boolean;
};

const severityRank: Record<AnalysisAlertSeverityV3 | "info" | "watch" | "important", number> = {
  important: 3,
  watch: 2,
  info: 1,
};

const sourceRank: Record<DailyBriefingFactV3["source"], number> = {
  stockbox_alert: 3,
  official_monitoring: 2,
  portfolio_snapshot: 1,
};

function time(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function severityOf(fact: DailyBriefingFactV3): "info" | "watch" | "important" {
  return fact.source === "portfolio_snapshot" ? "info" : fact.severity;
}

function factIdentity(fact: DailyBriefingFactV3): string {
  return `${fact.source}:${fact.sourceId}`;
}

/**
 * Deterministic briefing composition over already-persisted StockBox facts.
 * No provider, AI, suitability or personalized-score input is accepted here.
 */
export function composeDailyBriefingV3(input: {
  facts: DailyBriefingFactV3[];
  now?: Date;
  hours?: number;
  maxFacts?: number;
}): DailyBriefingV3 {
  const now = input.now ?? new Date();
  const hours = Math.max(1, Math.min(Math.floor(input.hours ?? 24), 168));
  const maxFacts = Math.max(1, Math.min(Math.floor(input.maxFacts ?? 20), 100));
  const factsThroughMs = now.getTime();
  const windowStartMs = factsThroughMs - hours * 60 * 60 * 1_000;

  const unique = new Map<string, DailyBriefingFactV3>();
  for (const fact of input.facts) {
    const observed = time(fact.observedAt);
    if (!observed || observed < windowStartMs || observed > factsThroughMs) continue;
    const key = factIdentity(fact);
    const existing = unique.get(key);
    if (!existing || time(existing.observedAt) < observed) unique.set(key, fact);
  }

  const facts = [...unique.values()]
    .sort((left, right) => {
      const severity = severityRank[severityOf(right)] - severityRank[severityOf(left)];
      if (severity) return severity;
      const source = sourceRank[right.source] - sourceRank[left.source];
      if (source) return source;
      const observed = time(right.observedAt) - time(left.observedAt);
      if (observed) return observed;
      return factIdentity(left).localeCompare(factIdentity(right));
    })
    .slice(0, maxFacts);

  const counts = {
    important: facts.filter((fact) => severityOf(fact) === "important").length,
    stockbox: facts.filter((fact) => fact.source === "stockbox_alert").length,
    official: facts.filter((fact) => fact.source === "official_monitoring").length,
    portfolio: facts.filter((fact) => fact.source === "portfolio_snapshot").length,
  };

  return {
    policyVersion: DAILY_BRIEFING_V3_POLICY_VERSION,
    windowStart: new Date(windowStartMs).toISOString(),
    factsThrough: now.toISOString(),
    hours,
    facts,
    counts,
    hasMaterialChanges: facts.some((fact) => fact.source !== "portfolio_snapshot" && severityOf(fact) !== "info"),
  };
}
