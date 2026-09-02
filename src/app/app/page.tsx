import Link from "next/link";
import type { ReactNode } from "react";
import { BarChart3, BookOpen, Brain, ShieldAlert } from "lucide-react";
import { sampleStockAnalysis as analysis } from "@/lib/stockbox/sample-analysis";

export default function DashboardPage() {
  return (
    <main className="grid gap-5">
      <header>
        <p className="text-sm font-black uppercase text-[var(--primary-strong)]">StockBox 2.0</p>
        <h1 className="display text-3xl font-black">Analysis workspace</h1>
        <p className="mt-2 max-w-2xl font-bold leading-relaxed text-[var(--muted)]">
          One deterministic analysis core for valuation context, fundamental quality, risk, confidence, and learning.
        </p>
      </header>

      <section className="card gloss p-5">
        <p className="text-sm font-black uppercase text-[var(--primary-strong)]">Current sample analysis</p>
        <h2 className="display mt-1 text-4xl font-black">{analysis.company.name}</h2>
        <p className="mt-2 font-bold text-[var(--muted)]">
          {analysis.company.ticker} • {analysis.company.industry} • {analysis.company.market}
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Link href="/app/analysis" className="button"><BarChart3 size={18} /> Open analysis</Link>
          <Link href="/app/analysis#teach-me" className="button secondary"><BookOpen size={18} /> Teach me</Link>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <Kpi icon={<Brain size={18} />} label="Overall" value={`${analysis.score.overall}/100`} />
        <Kpi icon={<BarChart3 size={18} />} label="Valuation" value={`${analysis.score.valuationAttractiveness}/100`} />
        <Kpi icon={<ShieldAlert size={18} />} label="Risk" value={analysis.risks.expectationRisk} />
        <Kpi icon={<BookOpen size={18} />} label="Confidence" value={analysis.confidence.level} />
      </section>
    </main>
  );
}

function Kpi({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="card bg-white/85 p-4">
      <div className="mb-2 text-[var(--primary-strong)]">{icon}</div>
      <p className="text-sm font-black text-[var(--muted)]">{label}</p>
      <p className="number text-2xl font-black">{value}</p>
    </div>
  );
}
