import type { AnalysisAlertKindV3, AnalysisAlertSeverityV3 } from "@/lib/alerts/analysis-alerts-v3";
import {
  composeDailyBriefingV3,
  type DailyBriefingFactV3,
  type DailyBriefingV3,
} from "@/lib/briefing/daily-briefing-v3";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { createAdminClient } from "@/lib/supabase/admin";

type StockBoxAlertRow = {
  id: string;
  ticker: string;
  alert_kind: AnalysisAlertKindV3;
  severity: AnalysisAlertSeverityV3;
  message_key: string;
  payload: Record<string, unknown> | null;
  observed_at: string;
};

type OfficialMonitoringRow = {
  id: string;
  ticker: string;
  signal_kind: "insider" | "short_interest" | "filing";
  severity: "info" | "watch" | "important";
  data_as_of: string | null;
  created_at: string;
};

type PortfolioSnapshotRow = {
  id: string;
  portfolio_id: string;
  base_currency: string;
  portfolio_value: number | string | null;
  invested_capital: number | string | null;
  unrealized_pl: number | string | null;
  unrealized_pl_percent: number | string | null;
  portfolio_score: number | string | null;
  risk_score: number | string | null;
  diversification_score: number | string | null;
  analysis_summary: Record<string, unknown> | null;
  created_at: string;
};

export type DailyBriefingSourceV3 = "stockbox_alerts" | "official_monitoring" | "portfolio";

export type LoadDailyBriefingV3Result =
  | { status: "disabled" }
  | { status: "unconfigured" }
  | {
      status: "ready";
      briefing: DailyBriefingV3;
      degradedSources: DailyBriefingSourceV3[];
    };

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function portfolioCompleteValuation(summary: Record<string, unknown> | null): boolean | null {
  return typeof summary?.completeValuation === "boolean" ? summary.completeValuation : null;
}

export async function loadDailyBriefingV3(input: {
  userId: string;
  now?: Date;
  hours?: number;
}): Promise<LoadDailyBriefingV3Result> {
  if (!isFeatureEnabled("dailyBriefing")) return { status: "disabled" };
  const admin = createAdminClient();
  if (!admin) return { status: "unconfigured" };

  const now = input.now ?? new Date();
  const hours = Math.max(1, Math.min(Math.floor(input.hours ?? 24), 168));
  const since = new Date(now.getTime() - hours * 60 * 60 * 1_000).toISOString();
  const through = now.toISOString();

  const [stockboxResult, officialResult, portfolioResult] = await Promise.all([
    admin
      .from("stockbox_alert_events_v3")
      .select("id,ticker,alert_kind,severity,message_key,payload,observed_at")
      .eq("user_id", input.userId)
      .gte("observed_at", since)
      .lte("observed_at", through)
      .order("observed_at", { ascending: false })
      .limit(40),
    admin
      .from("monitoring_events")
      .select("id,ticker,signal_kind,severity,data_as_of,created_at")
      .eq("user_id", input.userId)
      .gte("created_at", since)
      .lte("created_at", through)
      .order("created_at", { ascending: false })
      .limit(40),
    admin
      .from("portfolio_snapshots")
      .select("id,portfolio_id,base_currency,portfolio_value,invested_capital,unrealized_pl,unrealized_pl_percent,portfolio_score,risk_score,diversification_score,analysis_summary,created_at")
      .eq("user_id", input.userId)
      .gte("created_at", since)
      .lte("created_at", through)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const degradedSources: DailyBriefingSourceV3[] = [];
  const facts: DailyBriefingFactV3[] = [];

  if (stockboxResult.error) {
    degradedSources.push("stockbox_alerts");
  } else {
    for (const row of (stockboxResult.data ?? []) as StockBoxAlertRow[]) {
      facts.push({
        source: "stockbox_alert",
        sourceId: row.id,
        ticker: row.ticker.trim().toUpperCase(),
        kind: row.alert_kind,
        severity: row.severity,
        messageKey: row.message_key,
        payload: row.payload ?? {},
        observedAt: row.observed_at,
      });
    }
  }

  if (officialResult.error) {
    degradedSources.push("official_monitoring");
  } else {
    for (const row of (officialResult.data ?? []) as OfficialMonitoringRow[]) {
      facts.push({
        source: "official_monitoring",
        sourceId: row.id,
        ticker: row.ticker.trim().toUpperCase(),
        kind: row.signal_kind,
        severity: row.severity,
        dataAsOf: row.data_as_of,
        observedAt: row.created_at,
      });
    }
  }

  if (portfolioResult.error) {
    degradedSources.push("portfolio");
  } else {
    const row = ((portfolioResult.data ?? []) as PortfolioSnapshotRow[])[0];
    if (row) {
      facts.push({
        source: "portfolio_snapshot",
        sourceId: row.id,
        portfolioId: row.portfolio_id,
        baseCurrency: row.base_currency.trim().toUpperCase(),
        portfolioValue: finiteNumber(row.portfolio_value),
        investedCapital: finiteNumber(row.invested_capital),
        unrealizedPl: finiteNumber(row.unrealized_pl),
        unrealizedPlPercent: finiteNumber(row.unrealized_pl_percent),
        portfolioScore: finiteNumber(row.portfolio_score),
        riskScore: finiteNumber(row.risk_score),
        diversificationScore: finiteNumber(row.diversification_score),
        completeValuation: portfolioCompleteValuation(row.analysis_summary),
        observedAt: row.created_at,
      });
    }
  }

  return {
    status: "ready",
    briefing: composeDailyBriefingV3({ facts, now, hours }),
    degradedSources,
  };
}
