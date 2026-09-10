import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ArrowLeft, Database, Radar, TriangleAlert } from "lucide-react";
import { Card, Container, Section } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Alpha operations" };

type Numeric = number | string | null;
type ScanRunRow = {
  id: string;
  source: string;
  model_version: string;
  status: "running" | "completed" | "partial" | "failed";
  requested_limit: number;
  candidate_count: number;
  analyzed_count: number;
  prediction_count: number;
  skipped_count: number;
  failed_count: number;
  started_at: string;
  completed_at: string | null;
};
type QueueRow = {
  id: string;
  ticker: string;
  company_name: string;
  scan_failure_count: number;
  last_scan_status: string | null;
  last_scan_error_class: string | null;
  last_scan_attempt_at: string | null;
  last_alpha_scanned_at: string | null;
};
type PredictionRow = {
  id: string;
  ticker: string;
  company_name: string;
  origin_type: string;
  alpha_score: Numeric;
  breakout_score: Numeric;
  classification: string;
  confidence: Numeric;
  model_version: string;
  prediction_as_of: string;
};
type OutcomeIdentity = { ticker: string; company_name: string };
type OutcomeRow = {
  prediction_id: string;
  horizon_days: number;
  observed_return: Numeric;
  market_data_as_of: string;
  evaluated_at: string;
  alpha_predictions: OutcomeIdentity | OutcomeIdentity[] | null;
};

function asNumber(value: Numeric): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatScore(value: Numeric): string {
  const number = asNumber(value);
  return number === null ? "—" : number.toFixed(1);
}

function formatConfidence(value: Numeric): string {
  const number = asNumber(value);
  return number === null ? "—" : `${Math.round(number * 100)}%`;
}

function formatReturn(value: Numeric): string {
  const number = asNumber(value);
  if (number === null) return "—";
  const percent = number * 100;
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function outcomeIdentity(row: OutcomeRow): OutcomeIdentity | null {
  if (Array.isArray(row.alpha_predictions)) return row.alpha_predictions[0] ?? null;
  return row.alpha_predictions;
}

function statusClass(status: string): string {
  if (status === "completed" || status === "success") return "text-emerald-200";
  if (status === "partial" || status === "running") return "text-amber-200";
  if (status === "failed") return "text-red-200";
  return "text-[#c9d2df]";
}

export default async function AlphaAdminPage() {
  await requireAdmin();
  const supabase = createAdminClient();

  let universeCount = 0;
  let scanRunCount = 0;
  let predictionCount = 0;
  let outcomeCount = 0;
  let retryQueueCount = 0;
  let scanRuns: ScanRunRow[] = [];
  let retryQueue: QueueRow[] = [];
  let predictions: PredictionRow[] = [];
  let outcomes: OutcomeRow[] = [];

  if (supabase) {
    const [
      universeCountResult,
      scanRunCountResult,
      predictionCountResult,
      outcomeCountResult,
      retryQueueCountResult,
      scanRunResult,
      retryQueueResult,
      predictionResult,
      outcomeResult,
    ] = await Promise.all([
      supabase.from("alpha_universe_securities").select("id", { count: "exact", head: true }).eq("eligible", true),
      supabase.from("alpha_scan_runs").select("id", { count: "exact", head: true }),
      supabase.from("alpha_predictions").select("id", { count: "exact", head: true }),
      supabase.from("alpha_prediction_outcomes").select("id", { count: "exact", head: true }),
      supabase.from("alpha_universe_securities").select("id", { count: "exact", head: true }).eq("eligible", true).gt("scan_failure_count", 0),
      supabase.from("alpha_scan_runs")
        .select("id,source,model_version,status,requested_limit,candidate_count,analyzed_count,prediction_count,skipped_count,failed_count,started_at,completed_at")
        .order("started_at", { ascending: false })
        .limit(20),
      supabase.from("alpha_universe_securities")
        .select("id,ticker,company_name,scan_failure_count,last_scan_status,last_scan_error_class,last_scan_attempt_at,last_alpha_scanned_at")
        .eq("eligible", true)
        .gt("scan_failure_count", 0)
        .order("scan_failure_count", { ascending: false })
        .order("last_scan_attempt_at", { ascending: false, nullsFirst: false })
        .limit(20),
      supabase.from("alpha_predictions")
        .select("id,ticker,company_name,origin_type,alpha_score,breakout_score,classification,confidence,model_version,prediction_as_of")
        .order("prediction_as_of", { ascending: false })
        .limit(20),
      supabase.from("alpha_prediction_outcomes")
        .select("prediction_id,horizon_days,observed_return,market_data_as_of,evaluated_at,alpha_predictions(ticker,company_name)")
        .order("evaluated_at", { ascending: false })
        .limit(20),
    ]);

    universeCount = universeCountResult.count ?? 0;
    scanRunCount = scanRunCountResult.count ?? 0;
    predictionCount = predictionCountResult.count ?? 0;
    outcomeCount = outcomeCountResult.count ?? 0;
    retryQueueCount = retryQueueCountResult.count ?? 0;
    scanRuns = (scanRunResult.data ?? []) as ScanRunRow[];
    retryQueue = (retryQueueResult.data ?? []) as QueueRow[];
    predictions = (predictionResult.data ?? []) as PredictionRow[];
    outcomes = (outcomeResult.data ?? []) as unknown as OutcomeRow[];
  }

  const latestRun = scanRuns[0] ?? null;
  const stats = [
    { label: "Eligible universe", value: universeCount, note: "server-owned securities" },
    { label: "Scan runs", value: scanRunCount, note: latestRun ? `latest: ${latestRun.status}` : "no runs yet" },
    { label: "Predictions", value: predictionCount, note: "immutable PIT snapshots" },
    { label: "Outcomes", value: outcomeCount, note: "matured observations" },
    { label: "Retry queue", value: retryQueueCount, note: "eligible securities with failures" },
  ];

  return (
    <Section>
      <Container>
        <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-[#9aa7b8] hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Admin operations
        </Link>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#e1cb95]">Breakout Intelligence</p>
            <h1 className="serif mt-2 text-3xl font-semibold">Alpha operations</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#9aa7b8]">
              Read-only operational telemetry for the server-owned Alpha scanner and point-in-time outcome ledger.
            </p>
          </div>
          <span className={`rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs ${supabase ? "text-emerald-200" : "text-red-200"}`}>
            {supabase ? "Service-role database ready" : "Service-role database unavailable"}
          </span>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <Database className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
              <p className="mt-3 text-xs text-[#9aa7b8]">{stat.label}</p>
              <p className="number mt-1 text-3xl font-semibold">{stat.value}</p>
              <p className="mt-1 text-xs text-[#7f8b9b]">{stat.note}</p>
            </Card>
          ))}
        </div>

        <section className="mt-10">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Recent scan runs</h2>
          </div>
          <p className="mt-1 text-sm text-[#9aa7b8]">Latest 20 bounded scanner executions, newest first.</p>
          <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-[#9aa7b8]">
                <tr>
                  <th className="px-4 py-3">Started</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3 text-right">Requested</th><th className="px-4 py-3 text-right">Candidates</th>
                  <th className="px-4 py-3 text-right">Analyzed</th><th className="px-4 py-3 text-right">Predictions</th>
                  <th className="px-4 py-3 text-right">Skipped</th><th className="px-4 py-3 text-right">Failed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-[#0d1c2e]/70">
                {scanRuns.length ? scanRuns.map((run) => (
                  <tr key={run.id}>
                    <td className="px-4 py-3 text-xs text-[#c9d2df]">{formatDate(run.started_at)}</td>
                    <td className={`px-4 py-3 font-semibold ${statusClass(run.status)}`}>{run.status}</td>
                    <td className="px-4 py-3 text-xs text-[#c9d2df]">{run.model_version}</td>
                    <td className="number px-4 py-3 text-right">{run.requested_limit}</td>
                    <td className="number px-4 py-3 text-right">{run.candidate_count}</td>
                    <td className="number px-4 py-3 text-right">{run.analyzed_count}</td>
                    <td className="number px-4 py-3 text-right">{run.prediction_count}</td>
                    <td className="number px-4 py-3 text-right">{run.skipped_count}</td>
                    <td className={`number px-4 py-3 text-right ${run.failed_count > 0 ? "text-red-200" : "text-[#c9d2df]"}`}>{run.failed_count}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={9} className="px-4 py-5 text-[#9aa7b8]">No Alpha scan runs have been recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10">
          <div className="flex items-center gap-2">
            <TriangleAlert className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Retry queue</h2>
          </div>
          <p className="mt-1 text-sm text-[#9aa7b8]">Top 20 eligible securities with recorded scanner failures. This view does not mutate queue state.</p>
          <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-[#9aa7b8]">
                <tr><th className="px-4 py-3">Ticker</th><th className="px-4 py-3">Company</th><th className="px-4 py-3 text-right">Failures</th><th className="px-4 py-3">Last status</th><th className="px-4 py-3">Error class</th><th className="px-4 py-3">Last attempt</th><th className="px-4 py-3">Last success</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-[#0d1c2e]/70">
                {retryQueue.length ? retryQueue.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-semibold">{item.ticker}</td>
                    <td className="px-4 py-3 text-[#c9d2df]">{item.company_name}</td>
                    <td className="number px-4 py-3 text-right text-red-200">{item.scan_failure_count}</td>
                    <td className={`px-4 py-3 ${statusClass(item.last_scan_status ?? "")}`}>{item.last_scan_status ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-[#c9d2df]">{item.last_scan_error_class ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-[#c9d2df]">{formatDate(item.last_scan_attempt_at)}</td>
                    <td className="px-4 py-3 text-xs text-[#c9d2df]">{formatDate(item.last_alpha_scanned_at)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={7} className="px-4 py-5 text-[#9aa7b8]">No eligible securities currently have recorded scan failures.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10">
          <div className="flex items-center gap-2">
            <Radar className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Latest predictions</h2>
          </div>
          <p className="mt-1 text-sm text-[#9aa7b8]">Latest 20 immutable prediction snapshots. Scores are model outputs, not guaranteed investment outcomes.</p>
          <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-[#9aa7b8]">
                <tr><th className="px-4 py-3">As of</th><th className="px-4 py-3">Ticker</th><th className="px-4 py-3">Company</th><th className="px-4 py-3">Origin</th><th className="px-4 py-3 text-right">Alpha</th><th className="px-4 py-3 text-right">Breakout</th><th className="px-4 py-3">Class</th><th className="px-4 py-3 text-right">Confidence</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-[#0d1c2e]/70">
                {predictions.length ? predictions.map((prediction) => (
                  <tr key={prediction.id}>
                    <td className="px-4 py-3 text-xs text-[#c9d2df]">{formatDate(prediction.prediction_as_of)}</td>
                    <td className="px-4 py-3 font-semibold">{prediction.ticker}</td>
                    <td className="px-4 py-3 text-[#c9d2df]">{prediction.company_name}</td>
                    <td className="px-4 py-3 text-xs text-[#c9d2df]">{prediction.origin_type}</td>
                    <td className="number px-4 py-3 text-right">{formatScore(prediction.alpha_score)}</td>
                    <td className="number px-4 py-3 text-right">{formatScore(prediction.breakout_score)}</td>
                    <td className="px-4 py-3 text-xs text-[#c9d2df]">{prediction.classification}</td>
                    <td className="number px-4 py-3 text-right">{formatConfidence(prediction.confidence)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={8} className="px-4 py-5 text-[#9aa7b8]">No Alpha predictions have been recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Latest matured outcomes</h2>
          <p className="mt-1 text-sm text-[#9aa7b8]">Latest 20 recorded 30/90/180/365-day observations from the point-in-time outcome ledger.</p>
          <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-[#9aa7b8]">
                <tr><th className="px-4 py-3">Evaluated</th><th className="px-4 py-3">Ticker</th><th className="px-4 py-3">Company</th><th className="px-4 py-3 text-right">Horizon</th><th className="px-4 py-3 text-right">Return</th><th className="px-4 py-3">Market data as of</th></tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-[#0d1c2e]/70">
                {outcomes.length ? outcomes.map((outcome) => {
                  const identity = outcomeIdentity(outcome);
                  const observed = asNumber(outcome.observed_return);
                  return (
                    <tr key={`${outcome.prediction_id}:${outcome.horizon_days}`}>
                      <td className="px-4 py-3 text-xs text-[#c9d2df]">{formatDate(outcome.evaluated_at)}</td>
                      <td className="px-4 py-3 font-semibold">{identity?.ticker ?? outcome.prediction_id.slice(0, 8)}</td>
                      <td className="px-4 py-3 text-[#c9d2df]">{identity?.company_name ?? "—"}</td>
                      <td className="number px-4 py-3 text-right">{outcome.horizon_days}d</td>
                      <td className={`number px-4 py-3 text-right ${observed === null ? "text-[#c9d2df]" : observed >= 0 ? "text-emerald-200" : "text-red-200"}`}>{formatReturn(outcome.observed_return)}</td>
                      <td className="px-4 py-3 text-xs text-[#c9d2df]">{formatDate(outcome.market_data_as_of)}</td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={6} className="px-4 py-5 text-[#9aa7b8]">No matured Alpha outcomes have been recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </Container>
    </Section>
  );
}
