"use client";

import { Search, Sparkles } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import type {
  AnalysisReport,
  AnalysisType,
  CompanySearchResult,
  InvestmentProfile,
  UiMode
} from "@/lib/analysis/types";
import { commonCompanies } from "@/lib/data/common-companies";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SetupNotice } from "@/components/ui/setup-notice";
import { ReportView } from "./report-view";

type ApiResult =
  | { ok: true; data: AnalysisReport; warnings: string[]; persisted: boolean }
  | { ok: false; error: string; warnings: string[] };

export function AnalysisWorkbench({ financialConfigured }: { financialConfigured: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompanySearchResult[]>(commonCompanies.slice(0, 6));
  const [selected, setSelected] = useState<CompanySearchResult | null>(commonCompanies[0] ?? null);
  const [analysisType, setAnalysisType] = useState<AnalysisType>("summary");
  const [investmentProfile, setInvestmentProfile] = useState<InvestmentProfile>("balanced");
  const [mode, setMode] = useState<UiMode>("simple");
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const searchRequest = useRef(0);

  const canAnalyze = Boolean(selected) && financialConfigured && !isPending;

  const helperText = !financialConfigured
    ? "Set SEC_USER_AGENT to enable live SEC filings and market analysis."
    : !selected
      ? "Search and select a company."
      : `${selected.name} selected.`;

  async function searchCompanies(value: string) {
    setQuery(value);
    const requestId = searchRequest.current + 1;
    searchRequest.current = requestId;
    if (value.trim().length < 2) {
      setResults(commonCompanies.slice(0, 6));
      return;
    }

    const response = await fetch(`/api/companies/search?q=${encodeURIComponent(value)}`);
    if (!response.ok) return;
    const payload = (await response.json()) as { companies: CompanySearchResult[] };
    if (requestId === searchRequest.current) setResults(payload.companies);
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
        setError("error" in payload ? payload.error : "Analysis failed.");
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
              Search company
            </label>
            <div className="mt-2 flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa7b8]" aria-hidden="true" />
                <input
                  id="company-search"
                  value={query}
                  onChange={(event) => void searchCompanies(event.target.value)}
                  placeholder="AAPL, NVIDIA, Investor..."
                  className="h-11 w-full rounded-md border border-white/12 bg-[#07111f] pl-10 pr-3 text-sm text-[#f4efe5] placeholder:text-[#6f7b8c]"
                />
              </div>
              <Button type="button" onClick={runAnalysis} disabled={!canAnalyze}>
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {isPending ? "Analyzing" : "Analyze"}
              </Button>
            </div>
            <p className="mt-2 text-sm text-[#9aa7b8]">{helperText}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((company) => (
                <button
                  key={`${company.ticker}-${company.cik ?? company.name}`}
                  type="button"
                  onClick={() => setSelected(company)}
                  className={`rounded-md border p-3 text-left text-sm transition ${
                    selected?.ticker === company.ticker
                      ? "border-[#b99b5f]/60 bg-[#b99b5f]/15"
                      : "border-white/10 bg-white/5 hover:bg-white/8"
                  }`}
                >
                  <span className="block font-semibold text-[#f4efe5]">{company.ticker}</span>
                  <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[#9aa7b8]">{company.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            <label className="space-y-2 text-sm">
              <span className="font-semibold text-[#f4efe5]">Report type</span>
              <select
                value={analysisType}
                onChange={(event) => setAnalysisType(event.target.value as AnalysisType)}
                className="h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-[#f4efe5]"
              >
                <option value="summary">Ytlig / Summary</option>
                <option value="numbers">Siffror / Numbers</option>
                <option value="deep">Djup / Deep</option>
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-semibold text-[#f4efe5]">Investment profile</span>
              <select
                value={investmentProfile}
                onChange={(event) => setInvestmentProfile(event.target.value as InvestmentProfile)}
                className="h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-[#f4efe5]"
              >
                <option value="balanced">Balanced</option>
                <option value="long_term">Long-term</option>
                <option value="short_term">Short-term</option>
                <option value="growth">Growth</option>
                <option value="value">Value / valuation</option>
                <option value="quality">Quality</option>
                <option value="dividend">Dividend</option>
              </select>
            </label>
            <fieldset className="space-y-2 text-sm">
              <legend className="font-semibold text-[#f4efe5]">Mode</legend>
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
                    {item}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        </div>
      </Card>

      {!financialConfigured ? (
        <SetupNotice
          title="Live analysis provider setup required"
          detail="Add SEC_USER_AGENT to .env.local with a compliant contact string. Until then StockBox will search common companies but will not run live analysis."
        />
      ) : null}

      {error ? <SetupNotice title="Analysis failed" detail={error} /> : null}

      {report ? <ReportView report={report} mode={mode} /> : null}
    </div>
  );
}
