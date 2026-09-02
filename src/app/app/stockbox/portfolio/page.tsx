import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { stockBoxDemo } from "@/lib/stockbox/demo-data";
import { formatMinorMoney, formatSignedMinorMoney } from "@/lib/stockbox/format";

export default function PortfolioPage() {
  return (
    <main className="grid gap-5">
      <header className="grid gap-3">
        <Link href="/app/stockbox" className="text-sm font-black text-[var(--primary-strong)]">
          <ArrowLeft className="inline" size={14} /> Till V2
        </Link>
        <div>
          <p className="text-sm font-black uppercase text-[var(--primary-strong)]">Paper Trading</p>
          <h1 className="display text-4xl font-black">{stockBoxDemo.portfolio.name}</h1>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <Kpi label="Marknadsvärde" value={formatMinorMoney(stockBoxDemo.portfolio.marketValueOre)} />
        <Kpi label="Cash" value={formatMinorMoney(stockBoxDemo.portfolio.cashOre)} />
        <Kpi label="Orealiserad P/L" value={formatSignedMinorMoney(stockBoxDemo.portfolio.unrealizedPnlOre)} />
      </section>

      <section className="grid gap-3">
        {stockBoxDemo.positions.map((position) => (
          <article key={position.symbol} className="card p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
              <div>
                <p className="text-sm font-black text-[var(--primary-strong)]">{position.symbol}</p>
                <h2 className="text-xl font-black">{position.company}</h2>
                <p className="mt-2 font-bold text-[var(--muted)]">{position.thesis}</p>
              </div>
              <div className="rounded-[8px] bg-white p-3 text-right">
                <p className="text-sm font-black text-[var(--muted)]">P/L</p>
                <p className="number text-xl font-black text-[var(--success)]">{formatSignedMinorMoney(position.unrealizedPnlOre)}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <Kpi label="Antal" value={position.quantity} compact />
              <Kpi label="Entry" value={formatMinorMoney(position.entryPriceOre)} compact />
              <Kpi label="Nupris" value={formatMinorMoney(position.currentPriceOre)} compact />
              <Kpi label="Review" value={position.nextReview} compact />
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-[8px] bg-white/75 p-4">
        <div className="flex items-center gap-2 text-[var(--primary-strong)]">
          <ClipboardList size={18} />
          <h2 className="text-xl font-black text-[var(--ink)]">Trade ledger nästa</h2>
        </div>
        <p className="mt-2 font-bold text-[var(--muted)]">
          Nästa serversteg blir att skriva buy/sell till `stockbox_paper_trades`, uppdatera positioner och lägga append-only poster i `stockbox_paper_ledger_entries`.
        </p>
      </section>
    </main>
  );
}

function Kpi({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`${compact ? "rounded-[8px] bg-white p-3 shadow-none" : "card bg-white/85 p-4"}`}>
      <p className="text-sm font-black text-[var(--muted)]">{label}</p>
      <p className={`number font-black ${compact ? "text-lg" : "text-2xl"}`}>{value}</p>
    </div>
  );
}
