import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ClipboardCheck, Plus } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, Container, Section } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { createInvestmentThesisAction } from "@/lib/investor-intelligence/actions";
import { getInvestmentTheses } from "@/lib/investor-intelligence/queries";

export const metadata: Metadata = { title: "Investment Theses" };

type PageProps = { searchParams: Promise<{ error?: string }> };

const statusClass: Record<string, string> = {
  STRONG: "text-emerald-300",
  INTACT: "text-emerald-200",
  WATCH: "text-amber-300",
  WEAKENING: "text-orange-300",
  BROKEN: "text-red-300",
};

export default async function ThesisPage({ searchParams }: PageProps) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const theses = user ? await getInvestmentTheses() : [];

  return <Section><Container>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-[#e1cb95]">INVESTMENT THESIS TRACKER</p>
        <h1 className="serif mt-2 text-3xl font-semibold text-[#f4efe5]">Why do you own or follow it?</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#9aa7b8]">Define measurable requirements once. StockBox evaluates them against each new valid analysis and records exactly what failed, recovered, or could not be evaluated.</p>
      </div>
      <ButtonLink href="/watchlist">Watchlist <ArrowRight className="h-4 w-4" /></ButtonLink>
    </div>

    {!user ? <Card className="mt-8"><p className="text-sm text-[#c9d2df]">Sign in to create and monitor investment theses.</p><ButtonLink href="/auth/login" className="mt-4">Sign in</ButtonLink></Card> : <>
      {params.error ? <p className="mt-6 text-sm text-red-300" role="status">Could not save the thesis. Check the fields and try again.</p> : null}
      <Card className="mt-8">
        <div className="flex items-center gap-2"><Plus className="h-4 w-4 text-[#e1cb95]" /><h2 className="font-semibold text-[#f4efe5]">Create thesis</h2></div>
        <form action={createInvestmentThesisAction} className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="grid gap-1 text-xs text-[#9aa7b8]">Ticker<input name="ticker" required maxLength={16} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white" placeholder="MSFT" /></label>
          <label className="grid gap-1 text-xs text-[#9aa7b8]">Thesis title<input name="title" required maxLength={120} className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white" placeholder="Durable cloud compounder" /></label>
          <label className="grid gap-1 text-xs text-[#9aa7b8]">Fair value target<input name="fairValueTarget" type="number" step="any" className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white" /></label>
          <label className="grid gap-1 text-xs text-[#9aa7b8]">Preferred buy price<input name="preferredBuyPrice" type="number" step="any" className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white" /></label>
          <label className="grid gap-1 text-xs text-[#9aa7b8]">Required margin of safety (%)<input name="requiredMarginOfSafety" type="number" min="0" max="100" step="0.1" className="h-10 rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white" /></label>
          <label className="grid gap-1 text-xs text-[#9aa7b8]">Positive catalysts · one per line<textarea name="positiveCatalysts" rows={3} className="rounded-md border border-white/12 bg-[#07111f] px-3 py-2 text-sm text-white" /></label>
          <label className="grid gap-1 text-xs text-[#9aa7b8] lg:col-span-2">Core thesis notes<textarea name="notes" rows={4} className="rounded-md border border-white/12 bg-[#07111f] px-3 py-2 text-sm text-white" placeholder="What must remain true for the investment case to hold?" /></label>
          <label className="grid gap-1 text-xs text-[#9aa7b8]">Risk notes<textarea name="riskNotes" rows={3} className="rounded-md border border-white/12 bg-[#07111f] px-3 py-2 text-sm text-white" /></label>
          <label className="grid gap-1 text-xs text-[#9aa7b8]">Invalidation conditions<textarea name="invalidationConditions" rows={3} className="rounded-md border border-white/12 bg-[#07111f] px-3 py-2 text-sm text-white" /></label>
          <div className="lg:col-span-2"><Button><Plus className="h-4 w-4" />Create thesis</Button></div>
        </form>
      </Card>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-[#f4efe5]">Active theses</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {theses.length ? theses.map((thesis) => <Link key={thesis.id} href={`/thesis/${encodeURIComponent(thesis.ticker)}`} className="rounded-xl border border-white/10 bg-[#0d1c2e]/70 p-5 transition hover:border-[#e1cb95]/40 hover:bg-white/8">
            <div className="flex items-start justify-between gap-4"><div><p className="font-semibold text-[#e1cb95]">{thesis.ticker}</p><h3 className="mt-1 font-semibold text-[#f4efe5]">{thesis.title}</h3></div><span className={`text-xs font-bold ${statusClass[thesis.status] ?? "text-[#c9d2df]"}`}>{thesis.status}</span></div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-[#9aa7b8]"><div>Fair value<div className="number mt-1 text-sm text-[#f4efe5]">{thesis.fairValueTarget ?? "—"}</div></div><div>Preferred buy<div className="number mt-1 text-sm text-[#f4efe5]">{thesis.preferredBuyPrice ?? "—"}</div></div></div>
            <p className="mt-4 text-xs text-[#9aa7b8]">Last reviewed: {thesis.lastReviewedAt ? new Date(thesis.lastReviewedAt).toLocaleDateString() : "Waiting for next analysis"}</p>
          </Link>) : <Card><div className="flex items-center gap-3 text-sm text-[#9aa7b8]"><ClipboardCheck className="h-5 w-5" />No active thesis yet. Create one above, then add measurable rules.</div></Card>}
        </div>
      </section>
    </>}
  </Container></Section>;
}
