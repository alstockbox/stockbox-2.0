import type { Metadata } from "next";
import { BellRing, Check, Plus, Trash2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { acknowledgeAlertEventAction, createInvestmentAlertAction, removeInvestmentAlertAction } from "@/lib/investor-intelligence/actions";
import { canonicalMetricToDisplay, getInvestorMetric, INVESTOR_METRICS } from "@/lib/investor-intelligence/metric-catalog";
import { getAlertsIntelligence } from "@/lib/investor-intelligence/queries";

export const metadata: Metadata = { title: "Investment Alerts" };
type PageProps = { searchParams: Promise<{ ticker?: string }> };

function operatorLabel(operator: string) {
  return ({ below: "below", above: "above", crosses_below: "crosses below", crosses_above: "crosses above", change_abs_gte: "changes by at least" } as Record<string, string>)[operator] ?? operator;
}

export default async function AlertsPage({ searchParams }: PageProps) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const ticker = params.ticker?.trim().toUpperCase();
  const intelligence = user ? await getAlertsIntelligence(ticker) : { alerts: [], events: [] };

  return <Section><Container>
    <div><p className="text-sm font-semibold text-[#e1cb95]">INVESTMENT ALERTS</p><h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">Notify me when the investment state changes</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-[#9aa7b8]">Alerts are evaluated against normalized StockBox snapshots. Threshold alerts trigger on entry into the condition, not repeatedly while the same unchanged state remains true.</p></div>
    {!user ? <Card className="mt-8"><p className="text-sm text-[#c9d2df]">Sign in to create investment alerts.</p><ButtonLink href="/auth/login" className="mt-4">Sign in</ButtonLink></Card> : <>
      <Card className="mt-8"><div className="flex items-center gap-2"><Plus className="h-4 w-4 text-[#e1cb95]" /><h2 className="font-semibold text-[#f4efe5]">Create alert</h2></div>
        <form action={createInvestmentAlertAction} className="mt-5 grid gap-3 md:grid-cols-4">
          <label className="grid gap-1 text-xs text-[#9aa7b8]">Ticker<input name="ticker" required defaultValue={ticker ?? ""} maxLength={16} placeholder="MSFT" className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white" /></label>
          <label className="grid gap-1 text-xs text-[#9aa7b8]">Metric<select name="metricKey" className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white">{INVESTOR_METRICS.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}</select></label>
          <label className="grid gap-1 text-xs text-[#9aa7b8]">Trigger<select name="operator" className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white"><option value="below">Below</option><option value="above">Above</option><option value="crosses_below">Crosses below</option><option value="crosses_above">Crosses above</option><option value="change_abs_gte">Absolute change ≥</option></select></label>
          <label className="grid gap-1 text-xs text-[#9aa7b8]">Threshold<input name="threshold" required type="number" step="any" className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white" /></label>
          <div className="md:col-span-4"><Button><BellRing className="h-4 w-4" />Create alert</Button></div>
        </form>
        <p className="mt-3 text-xs text-[#748196]">Percentage metrics use normal human input: enter 15 for 15%, not 0.15.</p>
      </Card>

      <div className="mt-10 grid gap-8 xl:grid-cols-2">
        <section><h2 className="text-lg font-semibold text-[#f4efe5]">Active alerts</h2><div className="mt-4 overflow-hidden rounded-xl border border-white/10">
          {intelligence.alerts.length ? intelligence.alerts.map((alert) => {
            const metric = getInvestorMetric(alert.metricKey);
            return <div key={alert.id} className="flex items-center justify-between gap-4 border-b border-white/10 bg-[#0d1c2e]/70 p-4 last:border-0"><div><p className="font-semibold text-[#e1cb95]">{alert.ticker}</p><p className="mt-1 text-sm text-[#f4efe5]">{metric?.label ?? alert.metricKey} {operatorLabel(alert.operator)} {metric ? canonicalMetricToDisplay(metric, alert.threshold) : alert.threshold}</p><p className="mt-1 text-xs text-[#9aa7b8]">In-app · {alert.enabled ? "Active" : "Disabled"}</p></div><form action={removeInvestmentAlertAction}><input type="hidden" name="id" value={alert.id} /><Button variant="ghost" className="w-10 px-0" title="Remove alert"><Trash2 className="h-4 w-4" /><span className="sr-only">Remove alert</span></Button></form></div>;
          }) : <p className="bg-[#0d1c2e]/70 p-5 text-sm text-[#9aa7b8]">No active alerts yet.</p>}
        </div></section>

        <section><h2 className="text-lg font-semibold text-[#f4efe5]">Triggered events</h2><div className="mt-4 overflow-hidden rounded-xl border border-white/10">
          {intelligence.events.length ? intelligence.events.map((event) => {
            const tickerLabel = typeof event.payload.ticker === "string" ? event.payload.ticker : "Company";
            const reason = typeof event.payload.reason === "string" ? event.payload.reason : "Configured alert condition triggered.";
            return <div key={event.id} className="border-b border-white/10 bg-[#0d1c2e]/70 p-4 last:border-0"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold text-[#e1cb95]">{tickerLabel}</p><p className="mt-1 text-sm leading-6 text-[#f4efe5]">{reason}</p><p className="mt-2 text-xs text-[#9aa7b8]">{new Date(event.triggeredAt).toLocaleString()} · {event.status}</p></div>{event.status === "triggered" ? <form action={acknowledgeAlertEventAction}><input type="hidden" name="id" value={event.id} /><Button variant="ghost" className="h-9 px-3 text-xs"><Check className="h-4 w-4" />Acknowledge</Button></form> : null}</div></div>;
          }) : <p className="bg-[#0d1c2e]/70 p-5 text-sm text-[#9aa7b8]">No alert events have triggered.</p>}
        </div></section>
      </div>
    </>}
  </Container></Section>;
}
