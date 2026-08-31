import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle, Archive, CheckCircle2, CircleHelp, Plus, RotateCcw, XCircle } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { addThesisRuleAction, archiveInvestmentThesisAction, removeThesisRuleAction } from "@/lib/investor-intelligence/actions";
import { canonicalMetricToDisplay, getInvestorMetric, INVESTOR_METRICS } from "@/lib/investor-intelligence/metric-catalog";
import { readSnapshotMetric } from "@/lib/investor-intelligence/metrics";
import { getInvestmentThesisDetail } from "@/lib/investor-intelligence/queries";

export const metadata: Metadata = { title: "Investment Thesis" };

type PageProps = { params: Promise<{ ticker: string }> };

function statusTone(status: string) {
  if (status === "passed") return "text-emerald-300";
  if (status === "failed") return "text-red-300";
  return "text-amber-200";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "passed") return <CheckCircle2 className="h-4 w-4 text-emerald-300" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-red-300" />;
  return <CircleHelp className="h-4 w-4 text-amber-200" />;
}

function thresholdText(metricKey: string, threshold: unknown) {
  const metric = getInvestorMetric(metricKey);
  if (!metric) return JSON.stringify(threshold);
  if (typeof threshold === "number") return canonicalMetricToDisplay(metric, threshold);
  if (Array.isArray(threshold) && threshold.length === 2 && threshold.every((value) => typeof value === "number")) {
    return `${canonicalMetricToDisplay(metric, threshold[0] as number)} – ${canonicalMetricToDisplay(metric, threshold[1] as number)}`;
  }
  return "—";
}

export default async function ThesisDetailPage({ params }: PageProps) {
  const [{ ticker: rawTicker }, user] = await Promise.all([params, getCurrentUser()]);
  if (!user) return <Section><Container><Card><p className="text-sm text-[#c9d2df]">Sign in to view your investment thesis.</p><ButtonLink href="/auth/login" className="mt-4">Sign in</ButtonLink></Card></Container></Section>;
  const ticker = decodeURIComponent(rawTicker).toUpperCase();
  const detail = await getInvestmentThesisDetail(ticker);
  if (!detail) notFound();
  const { thesis, rules, evaluation, snapshot } = detail;

  return <Section><Container>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><Link href="/thesis" className="text-xs font-semibold text-[#e1cb95]">← All theses</Link><p className="mt-4 text-sm font-semibold text-[#e1cb95]">{thesis.ticker}</p><h1 className="serif mt-1 text-3xl font-semibold text-[#f4efe5]">{thesis.title}</h1><p className="mt-2 text-sm text-[#9aa7b8]">Created {new Date(thesis.initialThesisDate).toLocaleDateString()} · Last evaluated {thesis.lastReviewedAt ? new Date(thesis.lastReviewedAt).toLocaleString() : "not yet"}</p></div>
      <div className="rounded-full border border-white/10 bg-[#0d1c2e] px-4 py-2 text-sm font-bold text-[#f4efe5]">{thesis.status}</div>
    </div>

    <div className="mt-8 grid gap-4 md:grid-cols-3">
      <Card><p className="text-xs text-[#9aa7b8]">Fair value target</p><p className="number mt-2 text-2xl font-semibold">{thesis.fairValueTarget ?? "—"}</p></Card>
      <Card><p className="text-xs text-[#9aa7b8]">Preferred buy price</p><p className="number mt-2 text-2xl font-semibold">{thesis.preferredBuyPrice ?? "—"}</p></Card>
      <Card><p className="text-xs text-[#9aa7b8]">Required margin of safety</p><p className="number mt-2 text-2xl font-semibold">{thesis.requiredMarginOfSafety === null ? "—" : `${(thesis.requiredMarginOfSafety * 100).toFixed(1)}%`}</p></Card>
    </div>

    {evaluation ? <Card className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-[#e1cb95]">LATEST EVALUATION</p><h2 className="mt-1 text-lg font-semibold text-[#f4efe5]">{evaluation.previousStatus} → {evaluation.newStatus}</h2></div><p className="text-xs text-[#9aa7b8]">{new Date(evaluation.createdAt).toLocaleString()}</p></div>
      {evaluation.reasoning.length ? <div className="mt-4 space-y-2">{evaluation.reasoning.map((reason, index) => <p key={`${reason}-${index}`} className="text-sm leading-6 text-[#c9d2df]">{reason}</p>)}</div> : <p className="mt-4 text-sm text-[#9aa7b8]">No material thesis reasoning was recorded.</p>}
      {evaluation.newlyFailed.length ? <p className="mt-4 text-sm font-semibold text-red-300"><AlertTriangle className="mr-2 inline h-4 w-4" />{evaluation.newlyFailed.length} requirement(s) newly failed.</p> : null}
      {evaluation.newlyRecovered.length ? <p className="mt-3 text-sm font-semibold text-emerald-300"><RotateCcw className="mr-2 inline h-4 w-4" />{evaluation.newlyRecovered.length} requirement(s) recovered.</p> : null}
    </Card> : <Card className="mt-6"><p className="text-sm text-[#9aa7b8]">Run a new StockBox analysis for {ticker} after adding rules. The next valid analysis will create the first deterministic thesis evaluation.</p></Card>}

    <div className="mt-8 grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
      <section><h2 className="text-lg font-semibold text-[#f4efe5]">Thesis requirements</h2><div className="mt-4 overflow-hidden rounded-xl border border-white/10">
        {rules.length ? rules.map((rule) => {
          const result = evaluation?.results[rule.id] ?? "unavailable";
          const metric = getInvestorMetric(rule.metricKey);
          const actual = snapshot ? readSnapshotMetric(snapshot, rule.metricKey) : null;
          return <div key={rule.id} className="border-b border-white/10 bg-[#0d1c2e]/70 p-4 last:border-0">
            <div className="flex items-start justify-between gap-4"><div className="flex gap-3"><StatusIcon status={result} /><div><p className="font-semibold text-[#f4efe5]">{rule.label}</p><p className="mt-1 text-xs text-[#9aa7b8]">{metric?.label ?? rule.metricKey} · {rule.operator} · {thresholdText(rule.metricKey, rule.threshold)}</p></div></div><span className={`text-xs font-bold uppercase ${statusTone(result)}`}>{result}</span></div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[#c9d2df]">Current: {metric ? canonicalMetricToDisplay(metric, actual) : actual ?? "—"} · Failure status: {rule.failureStatus}{rule.critical ? " · Critical" : ""}</p><form action={removeThesisRuleAction}><input type="hidden" name="id" value={rule.id} /><input type="hidden" name="ticker" value={ticker} /><Button variant="ghost" className="h-8 px-3 text-xs">Remove</Button></form></div>
          </div>;
        }) : <p className="bg-[#0d1c2e]/70 p-5 text-sm text-[#9aa7b8]">No structured requirements yet.</p>}
      </div></section>

      <Card><div className="flex items-center gap-2"><Plus className="h-4 w-4 text-[#e1cb95]" /><h2 className="font-semibold text-[#f4efe5]">Add requirement</h2></div>
        <form action={addThesisRuleAction} className="mt-4 grid gap-3">
          <input type="hidden" name="thesisId" value={thesis.id} /><input type="hidden" name="ticker" value={ticker} />
          <label className="grid gap-1 text-xs text-[#9aa7b8]">Metric<select name="metricKey" required className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white">{INVESTOR_METRICS.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-[#9aa7b8]">Condition<select name="operator" className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white"><option value="gt">Greater than</option><option value="gte">At least</option><option value="lt">Less than</option><option value="lte">At most</option><option value="between">Between</option></select></label>
          <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-xs text-[#9aa7b8]">Threshold<input name="threshold" required type="number" step="any" className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white" /></label><label className="grid gap-1 text-xs text-[#9aa7b8]">Upper (between)<input name="thresholdHigh" type="number" step="any" className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white" /></label></div>
          <label className="grid gap-1 text-xs text-[#9aa7b8]">Failure consequence<select name="failureStatus" className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white"><option value="WATCH">WATCH</option><option value="WEAKENING">WEAKENING</option><option value="BROKEN">BROKEN</option></select></label>
          <label className="grid gap-1 text-xs text-[#9aa7b8]">Custom label<input name="label" maxLength={160} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white" /></label>
          <label className="flex items-center gap-2 text-xs text-[#c9d2df]"><input type="checkbox" name="critical" /> Critical requirement</label>
          <Button><Plus className="h-4 w-4" />Add rule</Button>
        </form>
      </Card>
    </div>

    <div className="mt-8 grid gap-4 lg:grid-cols-3">
      <Card><h2 className="font-semibold text-[#f4efe5]">Core notes</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#c9d2df]">{thesis.notes || "—"}</p></Card>
      <Card><h2 className="font-semibold text-[#f4efe5]">Risk notes</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#c9d2df]">{thesis.riskNotes || "—"}</p></Card>
      <Card><h2 className="font-semibold text-[#f4efe5]">Invalidation conditions</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#c9d2df]">{thesis.invalidationConditions || "—"}</p></Card>
    </div>
    {thesis.positiveCatalysts.length ? <Card className="mt-4"><h2 className="font-semibold text-[#f4efe5]">Positive catalysts</h2><ul className="mt-3 space-y-2 text-sm text-[#c9d2df]">{thesis.positiveCatalysts.map((catalyst) => <li key={catalyst}>• {catalyst}</li>)}</ul></Card> : null}

    <div className="mt-8 flex flex-wrap gap-3"><ButtonLink href={`/alerts?ticker=${encodeURIComponent(ticker)}`}>Create alert</ButtonLink><ButtonLink href="/analyze" variant="secondary">Run new analysis</ButtonLink><form action={archiveInvestmentThesisAction}><input type="hidden" name="id" value={thesis.id} /><input type="hidden" name="ticker" value={ticker} /><Button variant="ghost"><Archive className="h-4 w-4" />Archive thesis</Button></form></div>
  </Container></Section>;
}
