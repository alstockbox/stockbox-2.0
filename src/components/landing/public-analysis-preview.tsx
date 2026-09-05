"use client";

import Link from "next/link";
import { Play, Search, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import type { CompanySearchResult } from "@/lib/analysis/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Preview = {
  ticker: string;
  companyName: string;
  generatedAt: string;
  oneSentence: string;
  recommendation: string;
  score: number | null;
  confidence: number;
  dataCoverage: number | null;
  currentPrice: number | null;
  marketCurrency: string | null;
  dimensions: Array<{ key: string; label: string; score: number | null }>;
};

type Props = { locale: "sv" | "en"; videoUrl?: string | null };

function track(event: string, properties: Record<string, string | number> = {}) {
  void fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, properties }),
    keepalive: true,
  }).catch(() => undefined);
}

function displayPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${Math.round(value <= 1 ? value * 100 : value)}%`;
}

export function PublicAnalysisPreview({ locale, videoUrl }: Props) {
  const sv = locale === "sv";
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState<CompanySearchResult[]>([]);
  const [selected, setSelected] = useState<CompanySearchResult | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [showVideo, setShowVideo] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const value = query.trim();
    if (selected && value === `${selected.canonicalTicker ?? selected.ticker} — ${selected.name}`) return;
    if (value.length < 2) return;
    const current = ++requestId.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/companies/search?q=${encodeURIComponent(value)}`, { signal: controller.signal });
        const payload = await response.json() as { companies?: CompanySearchResult[] };
        if (response.ok && current === requestId.current) setCompanies(payload.companies ?? []);
      } catch (caught) {
        if (!(caught instanceof Error && caught.name === "AbortError") && current === requestId.current) setCompanies([]);
      } finally {
        if (current === requestId.current) setSearching(false);
      }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, selected]);

  function choose(company: CompanySearchResult) {
    setSelected(company);
    setQuery(`${company.canonicalTicker ?? company.ticker} — ${company.name}`);
    setCompanies([]);
    setPreview(null);
    setError(null);
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setSelected(null);
    setPreview(null);
    setError(null);
    if (value.trim().length < 2) {
      requestId.current += 1;
      setCompanies([]);
      setSearching(false);
    }
  }

  function analyze() {
    if (!selected || isPending) return;
    setError(null);
    track("cta_clicked", { cta: "free_analysis", location: "hero" });
    startTransition(async () => {
      const response = await fetch("/api/analysis/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: selected }),
      });
      const payload = await response.json().catch(() => ({})) as { preview?: Preview; error?: string };
      if (!response.ok || !payload.preview) {
        setPreview(null);
        setError(payload.error ?? (sv ? "Analysen kunde inte köras just nu." : "The analysis could not run right now."));
        return;
      }
      setPreview(payload.preview);
    });
  }

  return (
    <div id="free-analysis" className="scroll-mt-24">
      <Card className="border-[#e1cb95]/30 bg-[#0b1829] p-4 shadow-2xl shadow-black/20 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#e1cb95]">{sv ? "Testa direkt — inget konto först" : "Try it now — no account first"}</p>
            <h2 className="mt-1 text-xl font-semibold text-[#f4efe5]">{sv ? "Gör en gratis aktieanalys" : "Run a free stock analysis"}</h2>
          </div>
          <Sparkles className="h-5 w-5 shrink-0 text-[#e1cb95]" aria-hidden="true" />
        </div>

        <label htmlFor="public-company-search" className="sr-only">{sv ? "Sök bolag eller ticker" : "Search company or ticker"}</label>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa7b8]" aria-hidden="true" />
          <input
            id="public-company-search"
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            autoComplete="off"
            placeholder={sv ? "Sök t.ex. Investor, Apple eller AAPL" : "Search e.g. Apple, Investor or AAPL"}
            className="h-12 w-full rounded-lg border border-white/15 bg-[#07111f] pl-10 pr-3 text-sm text-[#f4efe5] outline-none ring-[#e1cb95]/50 placeholder:text-[#6f7b8c] focus:ring-2"
          />
        </div>
        {searching ? <p className="mt-2 text-xs text-[#9aa7b8]">{sv ? "Söker…" : "Searching…"}</p> : null}
        {companies.length ? (
          <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-[#07111f] p-1" role="listbox">
            {companies.slice(0, 6).map((company) => (
              <button key={`${company.securityId ?? ""}-${company.canonicalTicker ?? company.ticker}-${company.exchange ?? ""}`} type="button" onClick={() => choose(company)} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-white/8">
                <span className="min-w-0"><span className="block font-semibold text-[#f4efe5]">{company.canonicalTicker ?? company.ticker}</span><span className="block truncate text-xs text-[#9aa7b8]">{company.name}</span></span>
                <span className="shrink-0 text-xs text-[#6f7b8c]">{company.exchange ?? ""}</span>
              </button>
            ))}
          </div>
        ) : null}

        <Button type="button" onClick={analyze} disabled={!selected || isPending} className="mt-3 min-h-12 w-full text-base">
          <Sparkles className="h-4 w-4" aria-hidden="true" />{isPending ? (sv ? "Analyserar…" : "Analyzing…") : (sv ? "Gör en gratis analys" : "Run a free analysis")}
        </Button>
        <p className="mt-2 text-center text-xs text-[#7f8b9b]">{sv ? "Begränsad förhandsvisning. Full rapport, historik och sparning kräver gratis konto." : "Limited preview. Full report, history and saving require a free account."}</p>

        {error ? <div role="alert" className="mt-4 rounded-lg border border-red-400/25 bg-red-950/30 p-3 text-sm text-red-100">{error}</div> : null}
        {preview ? (
          <div className="mt-5 border-t border-white/10 pt-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="font-mono text-sm text-[#e1cb95]">{preview.ticker}</p><p className="mt-1 font-semibold text-[#f4efe5]">{preview.companyName}</p></div>
              <div className="text-right"><p className="text-xs text-[#9aa7b8]">StockBox Score</p><p className="number text-2xl font-semibold text-[#f4efe5]">{preview.score === null ? "—" : Math.round(preview.score)}</p></div>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#c9d2df]">{preview.oneSentence}</p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {preview.dimensions.map((dimension) => <div key={dimension.key} className="rounded-md bg-white/5 p-2.5"><p className="truncate text-xs text-[#9aa7b8]">{dimension.label}</p><p className="mt-1 font-semibold text-[#f4efe5]">{dimension.score === null ? "—" : Math.round(dimension.score)}</p></div>)}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><span className="text-[#7f8b9b]">{sv ? "Indikator" : "Signal"}</span><p className="mt-1 font-semibold text-[#e1cb95]">{preview.recommendation}</p></div><div><span className="text-[#7f8b9b]">Confidence</span><p className="mt-1 font-semibold">{displayPercent(preview.confidence)}</p></div><div><span className="text-[#7f8b9b]">Coverage</span><p className="mt-1 font-semibold">{displayPercent(preview.dataCoverage)}</p></div></div>
            <Link href="/auth/signup?next=/analyze" onClick={() => track("cta_clicked", { cta: "signup_after_preview", location: "hero_preview" })} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-[#b99b5f] px-4 text-sm font-semibold text-[#07111f] hover:bg-[#d0b579]">{sv ? "Skapa gratis konto för hela rapporten" : "Create free account for the full report"}</Link>
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-center gap-4 border-t border-white/10 pt-4 text-sm">
          <Link href="/auth/signup?next=/analyze" onClick={() => track("cta_clicked", { cta: "signup", location: "hero" })} className="font-semibold text-[#e1cb95] hover:text-white">{sv ? "Skapa gratis konto" : "Create free account"}</Link>
          <button type="button" onClick={() => { setShowVideo(true); track("video_demo_opened", { location: "hero" }); }} className="inline-flex items-center gap-1.5 font-semibold text-[#c9d2df] hover:text-white"><Play className="h-4 w-4" />{sv ? "Se snabb demo" : "Watch quick demo"}</button>
        </div>
      </Card>

      {showVideo ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label={sv ? "StockBox produktdemo" : "StockBox product demo"} onMouseDown={(event) => { if (event.currentTarget === event.target) setShowVideo(false); }}>
          <div className="w-full max-w-4xl rounded-xl border border-white/15 bg-[#07111f] p-3 shadow-2xl sm:p-5">
            <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{sv ? "StockBox på under två minuter" : "StockBox in under two minutes"}</h2><button type="button" onClick={() => setShowVideo(false)} aria-label={sv ? "Stäng video" : "Close video"} className="grid h-11 w-11 place-items-center rounded-md hover:bg-white/10"><X className="h-5 w-5" /></button></div>
            {videoUrl ? <video className="mt-3 aspect-video w-full rounded-lg bg-black" controls preload="metadata" playsInline poster="/images/stockbox-logo.png"><source src={videoUrl} /></video> : <div className="mt-3 grid aspect-video place-items-center rounded-lg border border-dashed border-white/20 bg-white/[0.03] p-6 text-center text-sm text-[#9aa7b8]"><div><Play className="mx-auto mb-3 h-8 w-8 text-[#e1cb95]" /><p>{sv ? "Videointegrationen är klar. Lägg in produktvideons URL för att aktivera uppspelning här." : "The video integration is ready. Add the product-video URL to enable playback here."}</p><Link href="/sample-analysis" className="mt-4 inline-block font-semibold text-[#e1cb95]">{sv ? "Se exempelanalys under tiden" : "View a sample analysis meanwhile"}</Link></div></div>}
          </div>
        </div>
      ) : null}
    </div>
  );
}
