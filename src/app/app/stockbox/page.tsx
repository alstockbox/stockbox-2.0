import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Brain, ClipboardCheck, LineChart, Scale, ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import { stockBoxDemo } from "@/lib/stockbox/demo-data";
import { sampleStockAnalysis } from "@/lib/stockbox/sample-analysis";
import { formatMinorMoney, formatPercentFromBps, formatSignedMinorMoney } from "@/lib/stockbox/format";

export default async function StockBoxPage({ searchParams }: { searchParams: Promise<{ thesis?: string }> }) {
  const params = await searchParams;
  const portfolioReturnBps = Number(
    ((stockBoxDemo.portfolio.totalEquityOre - stockBoxDemo.portfolio.initialCashOre) * 10_000n) /
      stockBoxDemo.portfolio.initialCashOre
  );

  return (
    <main className="grid gap-5">
      <header className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="text-sm font-black uppercase text-[var(--primary-strong)]">StockBox V2</p>
          <h1 className="display text-4xl font-black">Investor OS</h1>
          <p className="mt-2 max-w-2xl font-bold text-[var(--muted)]">
            Analyser, teser, simulerade beslut och reviews samlas i ett flöde som mäter process före avkastning.
          </p>
        </div>
        <Link href="/app/stockbox/thesis" className="button">
          <ClipboardCheck size={18} /> Ny tes
        </Link>
      </header>

      {params.thesis === "saved" ? (
        <p className="rounded-[8px] bg-green-50 p-3 font-black text-[var(--success)]">Tesen är sparad och första versionen är låst.</p>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        <Kpi label="Total paper equity" value={formatMinorMoney(stockBoxDemo.portfolio.totalEquityOre)} icon={<WalletCards size={18} />} />
        <Kpi label="Cash" value={formatMinorMoney(stockBoxDemo.portfolio.cashOre)} icon={<ShieldCheck size={18} />} />
        <Kpi label="Realiserad P/L" value={formatSignedMinorMoney(stockBoxDemo.portfolio.realizedPnlOre)} icon={<Scale size={18} />} />
        <Kpi label="Total return" value={formatPercentFromBps(portfolioReturnBps)} icon={<LineChart size={18} />} />
      </section>

      <section className="rounded-[8px] border border-[var(--border)] bg-white/75 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-sm font-black uppercase text-[var(--primary-strong)]">Aktuell rapport</p>
            <h2 className="text-xl font-black">{sampleStockAnalysis.company.name}</h2>
            <p className="font-bold text-[var(--muted)]">
              {sampleStockAnalysis.company.ticker} · Overall {sampleStockAnalysis.score.overall}/100 · {sampleStockAnalysis.valuation.qualityAdjusted.label}
            </p>
          </div>
          <Link href="/app/stockbox/trade" className="button secondary">
            Starta paper trade <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black">Aktiva positioner</h2>
            <Link href="/app/stockbox/portfolio" className="text-sm font-black text-[var(--primary-strong)]">
              Alla <ArrowRight className="inline" size={14} />
            </Link>
          </div>
          <div className="grid gap-3">
            {stockBoxDemo.positions.map((position) => (
              <article key={position.symbol} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-[var(--primary-strong)]">{position.symbol}</p>
                    <h3 className="text-lg font-black">{position.company}</h3>
                  </div>
                  <p className="number rounded-[8px] bg-[var(--mint)] px-3 py-1 text-sm font-black text-[var(--success)]">
                    {formatSignedMinorMoney(position.unrealizedPnlOre)}
                  </p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Mini label="Antal" value={position.quantity} />
                  <Mini label="Nupris" value={formatMinorMoney(position.currentPriceOre)} />
                  <Mini label="Score" value={String(position.stockboxScore)} />
                  <Mini label="Confidence" value={`${position.confidence}%`} />
                </div>
                <p className="mt-4 font-bold text-[var(--ink)]">{position.thesis}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-sm font-black">
                  <span className="rounded-[8px] bg-white px-3 py-1 text-[var(--muted)]">{position.thesisStatus}</span>
                  <span className="rounded-[8px] bg-white px-3 py-1 text-[var(--muted)]">Review {position.nextReview}</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="grid gap-4">
          <section className="card p-4">
            <div className="flex items-center gap-2 text-[var(--primary-strong)]">
              <Brain size={18} />
              <h2 className="text-xl font-black text-[var(--ink)]">Investor Score</h2>
            </div>
            <p className="number mt-3 text-5xl font-black">{stockBoxDemo.score.processScore}</p>
            <p className="font-bold text-[var(--muted)]">
              {stockBoxDemo.score.reliability} · {stockBoxDemo.score.sampleSize} beslut
            </p>
            <div className="mt-4 grid gap-3">
              {stockBoxDemo.score.dimensions.map((dimension) => (
                <div key={dimension.label}>
                  <div className="mb-1 flex justify-between text-sm font-black">
                    <span>{dimension.label}</span>
                    <span>{dimension.value}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--chrome)]">
                    <div className="h-2 rounded-full bg-[var(--primary)]" style={{ width: `${dimension.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 rounded-[8px] bg-white p-3 text-sm font-bold text-[var(--muted)]">{stockBoxDemo.score.focus}</p>
          </section>

          <section className="card p-4">
            <div className="flex items-center gap-2 text-[var(--primary-strong)]">
              <Sparkles size={18} />
              <h2 className="text-xl font-black text-[var(--ink)]">Nästa reviews</h2>
            </div>
            <div className="mt-3 grid gap-3">
              {stockBoxDemo.upcomingReviews.map((review) => (
                <div key={review.symbol} className="rounded-[8px] bg-white p-3">
                  <p className="font-black">
                    {review.symbol} · {review.due}
                  </p>
                  <p className="text-sm font-bold text-[var(--muted)]">{review.reason}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-black">Senaste paper trades</h2>
        <div className="grid gap-2">
          {stockBoxDemo.trades.map((trade) => (
            <div key={`${trade.side}-${trade.symbol}-${trade.date}-${trade.quantity}`} className="flex items-center justify-between gap-3 rounded-[8px] bg-white/85 p-3">
              <div>
                <p className="font-black">
                  {trade.side} {trade.quantity} {trade.symbol}
                </p>
                <p className="text-sm font-bold text-[var(--muted)]">
                  {trade.date} · {formatMinorMoney(trade.priceOre)}
                </p>
              </div>
              <p className="number font-black">{trade.pnlOre === null ? "Open" : formatSignedMinorMoney(trade.pnlOre)}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Kpi({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="card bg-white/85 p-4">
      <div className="mb-2 text-[var(--primary-strong)]">{icon}</div>
      <p className="text-sm font-black text-[var(--muted)]">{label}</p>
      <p className="number text-2xl font-black">{value}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] bg-white p-3">
      <p className="text-xs font-black uppercase text-[var(--muted)]">{label}</p>
      <p className="number font-black">{value}</p>
    </div>
  );
}
