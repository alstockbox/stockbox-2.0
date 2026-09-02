import Link from "next/link";
import { ArrowLeft, ClipboardCheck, ShieldCheck } from "lucide-react";
import { sampleStockAnalysis } from "@/lib/stockbox/sample-analysis";

export default function TradeIntentPage() {
  return (
    <main className="mx-auto grid max-w-3xl gap-5">
      <header className="grid gap-3">
        <Link href="/app/analysis" className="text-sm font-black text-[var(--primary-strong)]">
          <ArrowLeft className="inline" size={14} /> Till analys
        </Link>
        <div>
          <p className="text-sm font-black uppercase text-[var(--primary-strong)]">Paper Trade</p>
          <h1 className="display text-4xl font-black">Starta simulerat beslut</h1>
          <p className="mt-2 font-bold text-[var(--muted)]">
            Paper trading i StockBox är alltid simulerat. Nästa persistenssteg kör ordern server-side med idempotency key, cash check och append-only ledger.
          </p>
        </div>
      </header>

      <section className="card p-5">
        <div className="grid gap-4">
          <div className="rounded-[8px] bg-white p-4">
            <p className="text-sm font-black uppercase text-[var(--primary-strong)]">Rapport-snapshot</p>
            <h2 className="text-xl font-black">{sampleStockAnalysis.company.name}</h2>
            <p className="font-bold text-[var(--muted)]">
              {sampleStockAnalysis.company.ticker} · Score {sampleStockAnalysis.score.overall}/100 · {sampleStockAnalysis.confidence.level} confidence
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="field">
              <label>Portfolio</label>
              <select className="input" defaultValue="main">
                <option value="main">V2 Paper Portfolio</option>
              </select>
            </div>
            <div className="field">
              <label>Sida</label>
              <select className="input" defaultValue="buy">
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="field">
              <label>Antal</label>
              <input className="input" inputMode="decimal" placeholder="10" />
            </div>
            <div className="field">
              <label>Simulerat pris</label>
              <input className="input" inputMode="decimal" placeholder="274,50" />
            </div>
            <div className="field">
              <label>Avgift</label>
              <input className="input" inputMode="decimal" placeholder="9" />
            </div>
          </div>

          <div className="field">
            <label>Anteckning</label>
            <textarea className="input min-h-24 resize-y" placeholder="Vad förväntar du dig ska hända, och vad får dig att ompröva?" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link className="button secondary" href="/app/stockbox/thesis">
              <ClipboardCheck size={18} /> Skriv tes först
            </Link>
            <button className="button" type="button">
              <ShieldCheck size={18} /> Förhandsgranska order
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
