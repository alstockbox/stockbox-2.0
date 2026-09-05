"use client";

import { AlertTriangle, RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { CompanySearchResult } from "@/lib/analysis/types";
import { Button } from "@/components/ui/button";

type HoldingInput = { ticker: string; lastAnalysisAt?: string | null };
type Failure = { ticker: string; reason: string };
type Props = { portfolioId: string; holdings: HoldingInput[]; locale: "sv" | "en"; lastSnapshotAt?: string | null };

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

function track(event: string, properties: Record<string, string | number> = {}) {
  void fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, properties }),
    keepalive: true,
  }).catch(() => undefined);
}

function isStale(date: string | null | undefined) {
  if (!date) return true;
  const time = Date.parse(date);
  return !Number.isFinite(time) || Date.now() - time > STALE_AFTER_MS;
}

function exactCompany(ticker: string, companies: CompanySearchResult[]) {
  const target = ticker.trim().toUpperCase();
  return companies.find((company) => (company.canonicalTicker ?? company.ticker).trim().toUpperCase() === target)
    ?? companies.find((company) => company.ticker.trim().toUpperCase() === target)
    ?? companies[0]
    ?? null;
}

export function PortfolioAnalyzer({ portfolioId, holdings, locale, lastSnapshotAt }: Props) {
  const sv = locale === "sv";
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [failures, setFailures] = useState<Failure[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const stale = useMemo(() => holdings.filter((holding) => isStale(holding.lastAnalysisAt)), [holdings]);

  async function analyzeTicker(ticker: string): Promise<{ ok: true } | { ok: false; reason: string; quota?: boolean }> {
    const search = await fetch(`/api/companies/search?q=${encodeURIComponent(ticker)}`);
    const searchPayload = await search.json().catch(() => ({})) as { companies?: CompanySearchResult[]; error?: string };
    if (!search.ok) return { ok: false, reason: searchPayload.error ?? (sv ? "Bolaget kunde inte identifieras." : "The security could not be resolved.") };
    const company = exactCompany(ticker, searchPayload.companies ?? []);
    if (!company) return { ok: false, reason: sv ? "Ingen matchande börsnotering hittades." : "No matching listed security was found." };

    const response = await fetch("/api/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company,
        analysisType: "summary",
        investmentProfile: "balanced",
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) return { ok: false, reason: payload.error ?? (sv ? "Analysen misslyckades." : "Analysis failed."), quota: response.status === 429 };
    return { ok: true };
  }

  async function createSnapshot() {
    const response = await fetch("/api/portfolio/snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portfolioId }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string; snapshot?: { failures?: Failure[] } };
    if (!response.ok) throw new Error(payload.error ?? (sv ? "Portföljsnapshoten kunde inte sparas." : "The portfolio snapshot could not be saved."));
    return payload.snapshot?.failures ?? [];
  }

  async function run(forceLatest: boolean, retryOnly = false) {
    if (running || !holdings.length) return;
    const source = retryOnly && failures.length
      ? holdings.filter((holding) => failures.some((failure) => failure.ticker === holding.ticker))
      : forceLatest ? holdings : stale;
    setRunning(true);
    setMessage(null);
    setFailures([]);
    setProgress({ done: 0, total: source.length });
    track("portfolio_analysis_started", { holdingCount: holdings.length });
    const nextFailures: Failure[] = [];

    try {
      for (let index = 0; index < source.length; index += 1) {
        const holding = source[index];
        const result = await analyzeTicker(holding.ticker);
        if (!result.ok) {
          nextFailures.push({ ticker: holding.ticker, reason: result.reason });
          if (result.quota) {
            for (const remaining of source.slice(index + 1)) nextFailures.push({ ticker: remaining.ticker, reason: sv ? "Analyskvoten tog slut innan innehavet kunde uppdateras." : "The analysis quota was reached before this holding could refresh." });
            setProgress({ done: source.length, total: source.length });
            break;
          }
        }
        setProgress({ done: index + 1, total: source.length });
      }

      const snapshotFailures = await createSnapshot();
      const merged = [...nextFailures];
      for (const failure of snapshotFailures) {
        if (!merged.some((item) => item.ticker === failure.ticker && item.reason === failure.reason)) merged.push(failure);
      }
      setFailures(merged);
      setMessage(merged.length
        ? (sv ? `Portföljen analyserades med ${merged.length} varning${merged.length === 1 ? "" : "ar"}. Övriga innehav sparades korrekt.` : `Portfolio analysis completed with ${merged.length} warning${merged.length === 1 ? "" : "s"}. Other holdings were saved correctly.`)
        : (sv ? "Portföljen är uppdaterad och en ny historiksnapshot är sparad." : "The portfolio is updated and a new history snapshot has been saved."));
      track("portfolio_analysis_completed", { holdingCount: holdings.length, failedCount: merged.length });
      router.refresh();
    } catch (error) {
      const reason = error instanceof Error ? error.message : (sv ? "Portföljanalysen misslyckades." : "Portfolio analysis failed.");
      setMessage(reason);
      track("portfolio_analysis_failed", { errorCode: "portfolio_flow" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold text-[#f4efe5]">{sv ? "Portföljanalys" : "Portfolio analysis"}</h3>
          <p className="mt-1 text-xs leading-5 text-[#9aa7b8]">
            {lastSnapshotAt ? `${sv ? "Senaste snapshot" : "Latest snapshot"}: ${new Date(lastSnapshotAt).toLocaleString(sv ? "sv-SE" : "en-GB")}` : (sv ? "Ingen portföljsnapshot ännu." : "No portfolio snapshot yet.")}
            {stale.length ? ` · ${stale.length} ${sv ? "innehav behöver uppdateras" : "holdings need refresh"}` : holdings.length ? ` · ${sv ? "Analyserna är färska" : "Analyses are fresh"}` : ""}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" onClick={() => void run(false)} disabled={running || !holdings.length} className="min-h-11">
            <Sparkles className="h-4 w-4" />{running ? (sv ? "Analyserar…" : "Analyzing…") : (sv ? "Analysera hela portföljen" : "Analyze entire portfolio")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void run(true)} disabled={running || !holdings.length} className="min-h-11">
            <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />{sv ? "Senaste data" : "Latest data"}
          </Button>
        </div>
      </div>

      {running ? (
        <div className="mt-4" role="status" aria-live="polite">
          <div className="flex justify-between text-xs text-[#9aa7b8]"><span>{sv ? "Uppdaterar analyser och bygger snapshot" : "Refreshing analyses and building snapshot"}</span><span>{progress.done}/{progress.total}</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#b99b5f] transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 15}%` }} /></div>
        </div>
      ) : null}

      {message ? <p className="mt-4 text-sm text-[#c9d2df]" role="status">{message}</p> : null}
      {failures.length ? (
        <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-950/20 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-100"><AlertTriangle className="h-4 w-4" />{sv ? "Delvisa fel" : "Partial failures"}</div>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-100/80">
            {failures.slice(0, 8).map((failure, index) => <li key={`${failure.ticker}-${index}`}><strong>{failure.ticker}:</strong> {failure.reason}</li>)}
          </ul>
          <Button type="button" variant="secondary" onClick={() => void run(true, true)} disabled={running} className="mt-3 min-h-10">{sv ? "Försök igen för misslyckade innehav" : "Retry failed holdings"}</Button>
        </div>
      ) : null}
    </div>
  );
}
