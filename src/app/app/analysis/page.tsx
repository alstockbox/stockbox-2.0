import Link from "next/link";
import { AlertTriangle, BarChart3, BookOpen, CheckCircle2, CircleHelp, ClipboardCheck, Gauge, LineChart, ShieldAlert, WalletCards } from "lucide-react";
import type { ReactNode } from "react";
import { METRIC_LABELS } from "@/lib/stockbox/analysis-engine";
import { sampleStockAnalysis as analysis } from "@/lib/stockbox/sample-analysis";

export default function AnalysisPage() {
  return (
    <main className="grid gap-5">
      <header className="grid gap-1">
        <p className="text-sm font-black uppercase text-[var(--primary-strong)]">StockBox Analysis Engine</p>
        <h1 className="display text-3xl font-black">{analysis.company.name}</h1>
        <p className="font-bold text-[var(--muted)]">
          {analysis.company.ticker} • {analysis.company.industry} • {analysis.company.market}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link href="/app/stockbox/thesis" className="button">
          <ClipboardCheck size={18} /> Skriv tes
        </Link>
        <Link href="/app/stockbox/trade" className="button secondary">
          <WalletCards size={18} /> Starta paper trade
        </Link>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <Kpi label="Overall" value={`${analysis.score.overall}/100`} />
        <Kpi label="Business quality" value={`${analysis.score.businessQuality}/100`} />
        <Kpi label="Valuation" value={`${analysis.score.valuationAttractiveness}/100`} />
        <Kpi label="Confidence" value={analysis.confidence.level} />
      </section>

      <section className="card gloss p-5">
        <Title icon={<BookOpen size={20} />} text="For Dummies" />
        <div className="grid gap-3">
          {analysis.reportLevels.forDummies.map((line) => (
            <p key={line} className="font-bold leading-relaxed text-[var(--ink)]">{line}</p>
          ))}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="card p-4">
          <Title icon={<BarChart3 size={20} />} text="Valuation Snapshot" />
          <div className="grid gap-3 md:grid-cols-2">
            <Fact label="Absolute valuation" value={analysis.valuation.absolute.label} />
            <Fact label="Growth-adjusted" value={analysis.valuation.growthAdjusted.label} />
            <Fact label="Quality-adjusted" value={analysis.valuation.qualityAdjusted.label} />
            <Fact label="Premium justification" value={analysis.valuation.premiumJustification.level} />
            <Fact label="Sector regime" value={analysis.valuation.sectorRegime.regime} />
            <Fact label="Peer comparison" value={analysis.valuation.peerRelative.length ? "Available" : "Insufficient data"} />
          </div>
        </div>

        <div className="card p-4">
          <Title icon={<ShieldAlert size={20} />} text="Risk" />
          <div className="grid gap-3">
            <Fact label="Expectation risk" value={analysis.risks.expectationRisk} />
            <Fact label="Value trap risk" value={analysis.risks.valueTrapRisk} />
            {analysis.risks.flags.map((flag) => (
              <p key={flag} className="rounded-[8px] border border-[var(--border)] bg-white p-3 text-sm font-bold text-[var(--muted)]">
                {flag}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="card p-4">
        <Title icon={<LineChart size={20} />} text="Premium / Discount" />
        <div className="grid gap-2">
          {analysis.valuation.industryRelative.slice(0, 4).map((comparison) => (
            <div key={comparison.metric} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[8px] bg-white p-3">
              <div>
                <p className="font-black">{METRIC_LABELS[comparison.metric]} vs industry median</p>
                <p className="text-sm font-bold text-[var(--muted)]">
                  {comparison.current} vs {comparison.benchmark}
                </p>
              </div>
              <span className={`number font-black ${comparison.premiumPercent > 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>
                {comparison.premiumPercent > 0 ? "+" : ""}{comparison.premiumPercent.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="card p-4">
          <Title icon={<Gauge size={20} />} text="Score Explainability" />
          <div className="grid gap-2">
            {Object.entries(analysis.score.components).map(([label, value]) => (
              <div key={label} className="grid grid-cols-[1fr_auto] rounded-[8px] bg-white p-3 text-sm font-black">
                <span className="capitalize text-[var(--muted)]">{label}</span>
                <span className="number">{value}/100</span>
              </div>
            ))}
          </div>
        </div>

        <div id="teach-me" className="card p-4">
          <Title icon={<CircleHelp size={20} />} text="Teach Me" />
          <div className="grid gap-3">
            {analysis.education.map((entry) => (
              <details key={entry.term} className="rounded-[8px] border border-[var(--border)] bg-white p-3">
                <summary className="cursor-pointer font-black">{entry.term}</summary>
                <p className="mt-2 text-sm font-bold leading-relaxed text-[var(--muted)]">{entry.beginnerExplanation}</p>
                <p className="mt-2 text-sm font-bold leading-relaxed text-[var(--danger)]">{entry.commonMistake}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="card p-4">
        <Title icon={<CheckCircle2 size={20} />} text="Deep Mode" />
        <div className="grid gap-3">
          {analysis.reportLevels.deep.map((line) => (
            <p key={line} className="font-bold leading-relaxed text-[var(--ink)]">{line}</p>
          ))}
        </div>
      </section>

      <section className="card p-4">
        <Title icon={<AlertTriangle size={20} />} text="Data Integrity" />
        <div className="grid gap-2">
          {analysis.dataLimitations.map((limitation) => (
            <p key={limitation} className="rounded-[8px] bg-white p-3 text-sm font-bold text-[var(--muted)]">{limitation}</p>
          ))}
        </div>
      </section>
    </main>
  );
}

function Title({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="mb-4 flex items-center gap-2 text-[var(--primary-strong)]">
      {icon}
      <h2 className="text-xl font-black text-[var(--ink)]">{text}</h2>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card bg-white/85 p-4">
      <p className="text-sm font-black text-[var(--muted)]">{label}</p>
      <p className="number text-2xl font-black">{value}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] bg-white p-3">
      <p className="text-sm font-black text-[var(--muted)]">{label}</p>
      <p className="font-black">{value}</p>
    </div>
  );
}
