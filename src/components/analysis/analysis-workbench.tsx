"use client";

import { CheckCircle2, CircleDashed, Search, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import type {
  AnalysisReport,
  AnalysisType,
  CompanySearchResult,
  InvestmentProfile,
  UiMode
} from "@/lib/analysis/types";
import { profilePresentationFor } from "@/lib/analysis/profile-presentation";
import { commonCompanies } from "@/lib/data/common-companies";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import type { Locale } from "@/lib/i18n/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SetupNotice } from "@/components/ui/setup-notice";
import { ReportView } from "./report-view";
import {
  compactAnalysisCapability,
  formattedCompanySelection,
  queryRepresentsSelection,
  securitySelectionKey,
  selectionAfterQueryChange,
  supportsLiveFundamentals,
} from "./analysis-workbench-state";

type ApiResult =
  | { ok: true; data: AnalysisReport; warnings: string[]; persisted: boolean }
  | { ok: false; error: string; warnings: string[] };

export function AnalysisWorkbench({ financialConfigured, initialMode = "simple", initialInvestmentProfile = "balanced", locale = "en" }: { financialConfigured: boolean; initialMode?: UiMode; initialInvestmentProfile?: InvestmentProfile; locale?: Locale }) {
  const copy = getP0Copy(locale).analyze;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompanySearchResult[]>(commonCompanies.slice(0, 6));
  const [showSearchResults, setShowSearchResults] = useState(true);
  const [selected, setSelected] = useState<CompanySearchResult | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [analysisType, setAnalysisType] = useState<AnalysisType>("summary");
  const [investmentProfile, setInvestmentProfile] = useState<InvestmentProfile>(initialInvestmentProfile);
  const profilePresentation = profilePresentationFor(investmentProfile, locale);
  const [mode, setMode] = useState<UiMode>(initialMode);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStage, setLoadingStage] = useState(0);
  const [isPending, startTransition] = useTransition();
  const searchRequest = useRef(0);

  const canAnalyze = Boolean(selected) && supportsLiveFundamentals(selected) && financialConfigured && !isPending;
  const selectedSecurityKey = selected ? securitySelectionKey(selected) : null;

  const helperText = !financialConfigured
    ? copy.notConfigured
    : !selected
      ? copy.selectCompany
      : !supportsLiveFundamentals(selected)
        ? copy.unsupported
        : `${selected.canonicalTicker ?? selected.ticker} - ${selected.name}${selected.exchange ? ` - ${selected.exchange}` : ""} ${copy.selected}.`;

  function updateQuery(value: string) {
    const nextSelected = selectionAfterQueryChange(selected, value);
    if (selected && !nextSelected) {
      setSelected(null);
      setReport(null);
    }
    setQuery(value);
    setShowSearchResults(true);
    setError(null);
    setHighlightedIndex(-1);
    if (value.trim().length < 2) {
      setResults(commonCompanies.slice(0, 6));
      setIsSearching(false);
    }
  }

  function clearSearch() {
    searchRequest.current += 1;
    setQuery("");
    setSelected(null);
    setReport(null);
    setError(null);
    setResults(commonCompanies.slice(0, 6));
    setHighlightedIndex(-1);
    setIsSearching(false);
    setShowSearchResults(false);
  }

  function selectCompany(company: CompanySearchResult) {
    setSelected(company);
    setQuery(formattedCompanySelection(company));
    setReport(null);
    setError(null);
    setIsSearching(false);
    setShowSearchResults(true);
    const selectionKey = securitySelectionKey(company);
    setHighlightedIndex(results.findIndex((result) => securitySelectionKey(result) === selectionKey));
  }

  useEffect(() => {
    if (selected && queryRepresentsSelection(query, selected)) {
      return;
    }
    const value = query.trim();
    const requestId = searchRequest.current + 1;
    searchRequest.current = requestId;
    if (value.length < 2) {
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/companies/search?q=${encodeURIComponent(value)}`, { signal: controller.signal });
        if (!response.ok) return;
        const payload = (await response.json()) as { companies: CompanySearchResult[] };
        if (requestId === searchRequest.current) {
          setResults(payload.companies);
          setShowSearchResults(true);
          setHighlightedIndex(payload.companies.length ? 0 : -1);
        }
      } catch (searchError) {
        if (!(searchError instanceof Error && searchError.name === "AbortError") && requestId === searchRequest.current) {
          setResults([]);
        }
      } finally {
        if (requestId === searchRequest.current) setIsSearching(false);
      }
    }, 200);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, selected]);

  useEffect(() => {
    if (!isPending) return;
    const interval = window.setInterval(() => {
      setLoadingStage((stage) => Math.min(stage + 1, copy.loadingStages.length - 1));
    }, 900);
    return () => window.clearInterval(interval);
  }, [copy.loadingStages.length, isPending]);

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setShowSearchResults(false);
      setHighlightedIndex(-1);
      return;
    }
    if (!showSearchResults || !results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => current < results.length - 1 ? current + 1 : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => current > 0 ? current - 1 : results.length - 1);
    } else if (event.key === "Enter" && highlightedIndex >= 0) {
      event.preventDefault();
      selectCompany(results[highlightedIndex]);
    }
  }

  function runAnalysis() {
    if (!selected) return;
    setShowSearchResults(false);
    setError(null);
    setLoadingStage(0);
    startTransition(async () => {
      const response = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: selected,
          analysisType,
          investmentProfile
        })
      });
      const payload = (await response.json()) as ApiResult;
      if (!response.ok) {
        setError("error" in payload ? payload.error : copy.failedTitle);
        setReport(null);
        return;
      }
      if (!payload.ok) {
        setError(payload.error);
        setReport(null);
        return;
      }
      setReport(payload.data);
    });
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card className="p-4 sm:p-5">
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <label className="text-sm font-semibold text-[#f4efe5]" htmlFor="company-search">
              {copy.searchCompany}
            </label>
            <div className="mt-2 flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa7b8]" aria-hidden="true" />
                <input
                  id="company-search"
                  value={query}
                  onChange={(event) => updateQuery(event.target.value)}
                  onFocus={() => {
                    if (results.length) setShowSearchResults(true);
                  }}
                  onKeyDown={handleSearchKeyDown}
                  role="combobox"
                  aria-expanded={showSearchResults && results.length > 0}
                  aria-controls="company-search-results"
                  aria-activedescendant={showSearchResults && highlightedIndex >= 0 ? `company-result-${highlightedIndex}` : undefined}
                  placeholder={copy.placeholder}
                  className="h-11 w-full rounded-md border border-white/12 bg-[#07111f] pl-10 pr-11 text-sm text-[#f4efe5] placeholder:text-[#6f7b8c]"
                />
                {query || selected ? (
                  <button
                    type="button"
                    onClick={clearSearch}
                    aria-label={locale === "sv" ? "Rensa sökning" : "Clear search"}
                    title={locale === "sv" ? "Rensa" : "Clear"}
                    className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-[#9aa7b8] transition hover:bg-white/8 hover:text-white"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              <Button type="button" onClick={runAnalysis} disabled={!canAnalyze} className="hidden sm:inline-flex">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {isPending ? copy.analyzing : copy.analyze}
              </Button>
            </div>
            <p className="mt-2 text-xs leading-5 text-[#9aa7b8] sm:text-sm">{helperText}</p>

            {showSearchResults && results.length > 0 ? (
              <div id="company-search-results" role="listbox" className="mt-3 grid max-h-[22rem] gap-2 overflow-y-auto pr-1 sm:max-h-none sm:grid-cols-2 sm:overflow-visible sm:pr-0 lg:grid-cols-3">
                {results.map((company, index) => (
                  <button
                    key={securitySelectionKey(company)}
                    id={`company-result-${index}`}
                    type="button"
                    role="option"
                    aria-selected={selectedSecurityKey === securitySelectionKey(company)}
                    onClick={() => selectCompany(company)}
                    className={`rounded-md border p-2.5 text-left text-sm transition sm:p-3 ${
                      selectedSecurityKey === securitySelectionKey(company)
                        ? "border-[#b99b5f]/60 bg-[#b99b5f]/15"
                        : highlightedIndex === index
                          ? "border-white/30 bg-white/10"
                          : "border-white/10 bg-white/5 hover:bg-white/8"
                    }`}
                  >
                    <span className="block font-semibold text-[#f4efe5]">{company.canonicalTicker ?? company.ticker}</span>
                    <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[#9aa7b8]">{company.name}</span>
                    <span className="mt-1 block text-xs text-[#6f7b8c]">{[company.exchange, company.securityType].filter(Boolean).join(" - ")}</span>
                    <span className="mt-1 block text-xs text-[#7f8da0]">{compactAnalysisCapability(company)}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {isSearching ? <p className="mt-3 text-sm text-[#9aa7b8]">{copy.searching}</p> : null}
            {!isSearching && query.trim().length >= 2 && !selected && results.length === 0 ? (
              <p className="mt-3 text-sm text-[#9aa7b8]">{copy.noMatch}</p>
            ) : null}

            <div data-testid="primary-investment-profile" className="mt-4 rounded-lg border border-[#b99b5f]/25 bg-[#b99b5f]/5 p-3.5 sm:mt-5 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-semibold text-[#f4efe5]" htmlFor="investment-profile-primary">{copy.investmentProfile}</label>
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#e1cb95]">{copy.investmentProfile}</span>
              </div>
              <select
                id="investment-profile-primary"
                value={investmentProfile}
                onChange={(event) => setInvestmentProfile(event.target.value as InvestmentProfile)}
                className="mt-3 h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-[#f4efe5]"
              >
                <option value="balanced">{copy.balanced}</option>
                <option value="long_term">{copy.longTerm}</option>
                <option value="short_term">{copy.shortTerm}</option>
                <option value="growth">{copy.growth}</option>
                <option value="value">{copy.value}</option>
                <option value="quality">{copy.quality}</option>
                <option value="dividend">{copy.dividend}</option>
                <option value="defensive">{copy.defensive}</option>
              </select>
              <p className="mt-2 text-xs leading-5 text-[#aeb9c8] sm:mt-3">{profilePresentation.description}</p>
            </div>

            <div data-testid="mobile-analysis-cta" className="sticky bottom-3 z-20 mt-3 sm:hidden">
              <Button type="button" onClick={runAnalysis} disabled={!canAnalyze} className="min-h-12 w-full shadow-xl shadow-black/30">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {isPending ? copy.analyzing : copy.analyze}
              </Button>
            </div>
          </div>

          <details className="self-start rounded-lg border border-white/10 bg-white/[0.03] p-3.5 sm:p-4">
            <summary className="cursor-pointer text-sm font-semibold text-[#f4efe5]">{copy.advancedSettings}</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <label className="space-y-2 text-sm">
                <span className="font-semibold text-[#f4efe5]">{copy.reportType}</span>
                <select
                  value={analysisType}
                  onChange={(event) => setAnalysisType(event.target.value as AnalysisType)}
                  className="h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-[#f4efe5]"
                >
                  <option value="summary">{copy.summary}</option>
                  <option value="numbers">{copy.numbers}</option>
                  <option value="deep">{copy.deep}</option>
                  <option value="research">{copy.research}</option>
                </select>
              </label>
              <fieldset className="space-y-2 text-sm">
                <legend className="font-semibold text-[#f4efe5]">{copy.mode}</legend>
                <div className="grid grid-cols-2 rounded-md border border-white/12 bg-[#07111f] p-1">
                  {(["simple", "pro"] as UiMode[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setMode(item)}
                      className={`h-8 rounded text-xs font-semibold capitalize ${
                        mode === item ? "bg-[#b99b5f] text-[#07111f]" : "text-[#c9d2df]"
                      }`}
                    >
                      {item === "simple" ? copy.simple : copy.pro}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          </details>
        </div>
      </Card>

      {!financialConfigured ? (
        <SetupNotice
          title={copy.setupTitle}
          detail={copy.setupDetail}
        />
      ) : null}

      {error ? <SetupNotice title={copy.failedTitle} detail={error} /> : null}

      {isPending ? (
        <Card className="border-[#b99b5f]/25 bg-[#b99b5f]/5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-[#e1cb95]">{copy.analyzing}</p>
              <h2 className="mt-1 text-lg font-semibold text-[#f4efe5]">{selected?.name ?? selected?.ticker}</h2>
            </div>
            <span className="number text-xs text-[#9aa7b8]">{loadingStage + 1}/{copy.loadingStages.length}</span>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-5">
            {copy.loadingStages.map((stage, index) => {
              const complete = index < loadingStage;
              const active = index === loadingStage;
              const Icon = complete ? CheckCircle2 : CircleDashed;
              return (
                <div key={stage} className={active ? "rounded-md border border-[#b99b5f]/40 bg-[#b99b5f]/10 p-3" : "rounded-md border border-white/10 bg-white/5 p-3"}>
                  <Icon className={complete ? "h-4 w-4 text-emerald-300" : active ? "h-4 w-4 animate-spin text-[#e1cb95]" : "h-4 w-4 text-[#6f7b8c]"} aria-hidden="true" />
                  <p className="mt-2 text-xs leading-5 text-[#c9d2df]">{stage}</p>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {report ? <ReportView report={report} mode={mode} locale={locale} /> : null}
    </div>
  );
}
