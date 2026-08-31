"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CompanySearchResult } from "@/lib/analysis/types";
import { formatAnalysisTimestamp } from "@/lib/analysis/timestamp";
import { localizedResearchView, overallResearchView } from "@/lib/analysis/research-view";
import { reportSearchMatch } from "@/lib/analysis/comparison";
import type { Locale } from "@/lib/i18n/types";

export type ComparisonHistoryItem = {
  id: string;
  ticker: string;
  company_name: string;
  analysis_type: string;
  recommendation: string | null;
  score: number | null;
  confidence: number | null;
  data_coverage: number | null;
  model_version: string | null;
  generated_at: string | null;
  created_at: string;
};

function canonicalTicker(company: CompanySearchResult) {
  return company.canonicalTicker ?? company.ticker;
}

export function ComparisonPicker({ available, initialSelectedIds, locale }: {
  available: ComparisonHistoryItem[];
  initialSelectedIds: string[];
  locale: Locale;
}) {
  const sv = locale === "sv";
  const [query, setQuery] = useState("");
  const [activeCompany, setActiveCompany] = useState<CompanySearchResult | null>(null);
  const [companies, setCompanies] = useState<CompanySearchResult[]>([]);
  const [selectedIds, setSelectedIds] = useState(initialSelectedIds);
  const [isSearching, setIsSearching] = useState(false);
  const searchRequest = useRef(0);

  useEffect(() => {
    const value = query.trim();
    if (activeCompany || value.length < 2) return;
    const requestId = ++searchRequest.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/companies/search?q=${encodeURIComponent(value)}`, { signal: controller.signal });
        if (!response.ok) return;
        const payload = (await response.json()) as { companies?: CompanySearchResult[] };
        if (requestId === searchRequest.current) setCompanies(payload.companies ?? []);
      } finally {
        if (requestId === searchRequest.current) setIsSearching(false);
      }
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, activeCompany]);

  const matchingReports = useMemo(() => {
    if (activeCompany) {
      const ticker = canonicalTicker(activeCompany).toUpperCase();
      return available.filter((item) => item.ticker.toUpperCase() === ticker);
    }
    return available.filter((item) => reportSearchMatch(item, query));
  }, [activeCompany, available, query]);

  function selectCompany(company: CompanySearchResult) {
    setActiveCompany(company);
    setQuery(`${canonicalTicker(company)} · ${company.name}`);
    setCompanies([]);
  }

  function toggleReport(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((candidate) => candidate !== id);
      if (current.length >= 3) return current;
      return [...current, id];
    });
  }

  return (
    <form id="comparison-picker" action="/compare" method="get" className="rounded-xl border border-white/10 bg-[#0d1c2e]/70 p-4 sm:p-5">
      {selectedIds.map((id) => <input key={id} type="hidden" name="id" value={id} />)}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#e1cb95]">{sv ? "1. Hitta bolag eller rapport" : "1. Find a company or report"}</p>
          <h2 className="mt-1 text-lg font-semibold text-[#f4efe5]">{sv ? "Välj sparade rapporter" : "Select saved reports"}</h2>
          <p className="mt-1 text-xs leading-5 text-[#9aa7b8]">{sv ? "Sök ticker, bolagsnamn eller bland dina tidigare StockBox-analyser. Välj upp till tre snapshots." : "Search by ticker, company name, or your previous StockBox analyses. Select up to three snapshots."}</p>
        </div>
        <div className="rounded-full border border-white/10 bg-[#07111f] px-3 py-1 text-xs text-[#c9d2df]">{selectedIds.length}/3 {sv ? "valda" : "selected"}</div>
      </div>

      <div className="relative mt-5">
        <label htmlFor="comparison-search" className="sr-only">{sv ? "Sök bolag eller rapport" : "Search company or report"}</label>
        <input id="comparison-search" value={query} onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          setActiveCompany(null);
          if (value.trim().length < 2) {
            setCompanies([]);
            setIsSearching(false);
          }
        }} placeholder="META, Meta Platforms, AAPL, Investor..." className="h-12 w-full rounded-lg border border-white/12 bg-[#07111f] px-4 text-sm text-[#f4efe5] outline-none placeholder:text-[#6f7b8c] focus:border-[#b99b5f]/70" autoComplete="off" />
        {query ? <button type="button" onClick={() => { setQuery(""); setActiveCompany(null); setCompanies([]); }} className="absolute right-3 top-3 text-xs font-semibold text-[#9aa7b8] hover:text-white">{sv ? "Rensa" : "Clear"}</button> : null}
      </div>

      {!activeCompany && (companies.length || isSearching) ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-[#07111f] p-2">
          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9aa7b8]">{isSearching ? (sv ? "Söker bolag..." : "Searching companies...") : (sv ? "Bolag" : "Companies")}</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {companies.slice(0, 6).map((company) => (
              <button key={`${company.entityId ?? company.ticker}-${company.exchange ?? ""}`} type="button" onClick={() => selectCompany(company)} className="rounded-md p-3 text-left hover:bg-white/[0.06]">
                <span className="block text-sm font-semibold text-[#f4efe5]">{company.name}</span>
                <span className="mt-1 block font-mono text-xs text-[#e1cb95]">{canonicalTicker(company)}{company.exchange ? ` · ${company.exchange}` : ""}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9aa7b8]">{activeCompany ? `${activeCompany.name} · ${canonicalTicker(activeCompany)}` : (sv ? "Tidigare rapporter" : "Previous reports")}</p>
          <span className="text-xs text-[#6f7b8c]">{matchingReports.length} {sv ? "rapporter" : "reports"}</span>
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {matchingReports.slice(0, 30).map((analysis) => {
            const selected = selectedIds.includes(analysis.id);
            const disabled = !selected && selectedIds.length >= 3;
            return (
              <button key={analysis.id} type="button" disabled={disabled} onClick={() => toggleReport(analysis.id)} className={`rounded-lg border p-3 text-left transition ${selected ? "border-[#b99b5f]/70 bg-[#b99b5f]/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"} disabled:cursor-not-allowed disabled:opacity-45`}>
                <span className="flex items-start justify-between gap-3">
                  <span><strong className="text-sm text-[#f4efe5]">{analysis.company_name}</strong><span className="mt-1 block font-mono text-xs text-[#e1cb95]">{analysis.ticker}</span></span>
                  <span className="text-xs font-semibold text-[#c9d2df]">{selected ? (sv ? "Vald" : "Selected") : "+"}</span>
                </span>
                <span className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#9aa7b8]">
                  <span>{analysis.analysis_type} · {localizedResearchView(overallResearchView({ score: analysis.score, confidence: analysis.confidence, coverage: analysis.data_coverage }), locale)}</span>
                  <span className="text-right">{analysis.score === null ? "Not available" : `${Math.round(analysis.score)}/100`}</span>
                  <span className="col-span-2">{formatAnalysisTimestamp(analysis.generated_at ?? analysis.created_at, locale)}</span>
                </span>
              </button>
            );
          })}
        </div>
        {!matchingReports.length ? <div className="mt-3 rounded-lg border border-dashed border-white/12 p-4 text-sm leading-6 text-[#9aa7b8]">{activeCompany ? (sv ? "Det finns ingen sparad rapport för det här bolaget ännu. Skapa en analys först och återvänd sedan hit." : "There is no saved report for this company yet. Run an analysis first, then return here.") : (sv ? "Inga tidigare rapporter matchar sökningen." : "No previous reports match your search.")}</div> : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
        <button type="submit" disabled={selectedIds.length < 2} className="inline-flex h-10 items-center justify-center rounded-md bg-[#b99b5f] px-4 text-sm font-semibold text-[#07111f] hover:bg-[#d0b579] disabled:cursor-not-allowed disabled:opacity-45">{sv ? `Jämför ${selectedIds.length} rapporter` : `Compare ${selectedIds.length} reports`}</button>
        {selectedIds.length ? <button type="button" onClick={() => setSelectedIds([])} className="text-sm font-semibold text-[#9aa7b8] hover:text-white">{sv ? "Ny jämförelse" : "New comparison"}</button> : null}
        <span className="text-xs text-[#6f7b8c]">{selectedIds.length < 2 ? (sv ? "Välj minst två rapporter." : "Select at least two reports.") : (sv ? "Samma bolag kan jämföras över tid." : "The same company can be compared across time.")}</span>
      </div>
    </form>
  );
}
