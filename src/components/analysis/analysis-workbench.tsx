"use client";

import { Search, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import type {
  AnalysisReport,
  AnalysisType,
  CompanySearchResult,
  InvestmentProfile,
  UiMode
} from "@/lib/analysis/types";
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
  const [selected, setSelected] = useState<CompanySearchResult | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [analysisType, setAnalysisType] = useState<AnalysisType>("summary");
  const [investmentProfile, setInvestmentProfile] = useState<InvestmentProfile>(initialInvestmentProfile);
  const [mode, setMode] = useState<UiMode>(initialMode);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
    setHighlightedIndex(-1);
    if (value.trim().length < 2) {
      setResults(commonCompanies.slice(0, 6));
      setIsSearching(false);
    }
  }

  function selectCompany(company: CompanySearchResult) {
    setSelected(company);
    setQuery(formattedCompanySelection(company));
    setReport(null);
    setError(null);
    setIsSearching(false);
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

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setResults([]);
      setHighlightedIndex(-1);
      return;
    }
    if (!results.length) return;
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
    setError(null);
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
    <div className="space-y-6">
      <Card className="p-5">
        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
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
                  onKeyDown={handleSearchKeyDown}
                  role="combobox"
                  aria-expanded={results.length > 0}
                  aria-controls="company-search-results"
                  aria-activedescendant={highlightedIndex >= 0 ? `company-result-${highlightedIndex}` : undefined}
                  placeholder={copy.placeholder}
                  className="h-11 w-full rounded-md border border-white/12 bg-[#07111f] pl-10 pr-3 text-sm text-[#f4efe5] placeholder:text-[#6f7b8c]"
                />
              </div>
              <Button type="button" onClick={runAnalysis} disabled={!canAnalyze}>
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {isPending ? copy.analyzing : copy.analyze}
              </Button>
            </div>
            <p className="mt-2 text-sm text-[#9aa7b8]">{helperText}</p>
            <div id="company-search-results" role="listbox" className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((company, index) => (
                <button
                  key={securitySelectionKey(company)}
                  id={`company-result-${index}`}
                  type="button"
                  role="option"
                  aria-selected={selectedSecurityKey === securitySelectionKey(company)}
                  onClick={() => selectCompany(company)}
                  className={`rounded-md border p-3 text-left text-sm transition ${
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
            {isSearching ? <p className="mt-3 text-sm text-[#9aa7b8]">{copy.searching}</p> : null}
            {!isSearching && query.trim().length >= 2 && !selected && results.length === 0 ? (
              <p className="mt-3 text-sm text-[#9aa7b8]">{copy.noMatch}</p>
            ) : null}
          </div>

          <details className="self-start rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <summary className="cursor-pointer text-sm font-semibold text-[#f4efe5]">{copy.advancedSettings}</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
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
            <label className="space-y-2 text-sm">
              <span className="font-semibold text-[#f4efe5]">{copy.investmentProfile}</span>
              <select
                value={investmentProfile}
                onChange={(event) => setInvestmentProfile(event.target.value as InvestmentProfile)}
                className="h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-[#f4efe5]"
              >
                <option value="balanced">{copy.balanced}</option>
                <option value="long_term">{copy.longTerm}</option>
                <option value="short_term">{copy.shortTerm}</option>
                <option value="growth">{copy.growth}</option>
                <option value="value">{copy.value}</option>
                <option value="quality">{copy.quality}</option>
                <option value="dividend">{copy.dividend}</option>
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

      {report ? <ReportView report={report} mode={mode} locale={locale} /> : null}
    </div>
  );
}
