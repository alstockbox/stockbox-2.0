"use client";

import Link from "next/link";
import {
  CheckCircle2,
  CircleDashed,
  Download,
  FileUp,
  LoaderCircle,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Square,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { captureClientEvent } from "@/lib/analytics/client";
import type {
  AnalysisReport,
  AnalysisType,
  CompanySearchResult,
  InvestmentProfile,
} from "@/lib/analysis/types";
import { formatAnalysisTimestamp } from "@/lib/analysis/timestamp";
import { localizedResearchView, researchViewForReport } from "@/lib/analysis/research-view";
import { MAX_BATCH_ROWS, parseBatchInput } from "@/lib/batch/input";
import { rankBatchResults } from "@/lib/batch/ranking";
import { getP0Copy } from "@/lib/i18n/p0-copy";
import type { Locale } from "@/lib/i18n/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SetupNotice } from "@/components/ui/setup-notice";
type BatchStatus =
  | "ready"
  | "ambiguous"
  | "not_found"
  | "unsupported"
  | "lookup_failed"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

type BatchRow = {
  input: string;
  company?: CompanySearchResult;
  status: BatchStatus;
  error?: string;
  report?: AnalysisReport;
  idempotencyKey?: string;
};

type ResolvePayload = {
  error?: string;
  items?: BatchRow[];
  entitlement?: { plan: string; rowLimit: number };
};

type DurableBatchItemPayload = {
  input_ticker: string;
  canonical_ticker?: string;
  company_name?: string;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  report?: AnalysisReport | null;
  last_error?: string | null;
};

type DurableBatchPayload = {
  error?: string;
  run?: { status: "queued" | "processing" | "completed" | "partial" | "failed" | "cancelled" };
  items?: DurableBatchItemPayload[];
};

const LAST_BATCH_STORAGE_KEY = "stockbox:last-batch-id";

const terminalStatuses = new Set<BatchStatus>([
  "completed",
  "failed",
  "cancelled",
  "ambiguous",
  "not_found",
  "unsupported",
  "lookup_failed",
]);

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function statusLabel(status: BatchStatus, copy: ReturnType<typeof getP0Copy>["batch"]) {
  return {
    ready: copy.statusReady,
    running: copy.statusAnalyzing,
    completed: copy.statusCompleted,
    failed: copy.statusFailed,
    cancelled: copy.statusCancelled,
    ambiguous: copy.statusAmbiguous,
    not_found: copy.statusNotFound,
    unsupported: copy.statusUnsupported,
    lookup_failed: copy.statusLookupFailed,
  }[status];
}

function localizedBatchError(message: string | null | undefined, fallback: string, monthlyLimit: string, rateLimited: string): string {
  if (!message) return fallback;
  if (message.includes("Monthly analysis limit reached")) return monthlyLimit;
  if (message.includes("Too many requests")) return rateLimited;
  return message;
}

function StatusIcon({ status }: { status: BatchStatus }) {
  if (status === "completed") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />;
  }
  if (status === "running") {
    return <LoaderCircle className="h-4 w-4 animate-spin text-[#e1cb95]" aria-hidden="true" />;
  }
  if (terminalStatuses.has(status)) {
    return <XCircle className="h-4 w-4 text-red-300" aria-hidden="true" />;
  }
  return <CircleDashed className="h-4 w-4 text-[#9aa7b8]" aria-hidden="true" />;
}

export function BatchWorkbench({ financialConfigured, locale }: { financialConfigured: boolean; locale: Locale }) {
  const allCopy = getP0Copy(locale);
  const copy = allCopy.batch;
  const analyzeCopy = allCopy.analyze;
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CompanySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [analysisType, setAnalysisType] = useState<AnalysisType>("summary");
  const [investmentProfile, setInvestmentProfile] = useState<InvestmentProfile>("balanced");
  const [entitlement, setEntitlement] = useState<ResolvePayload["entitlement"]>();
  const [isResolving, setIsResolving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const parsed = useMemo(() => parseBatchInput(input), [input]);
  const completedRows = rows.filter((row) => row.status === "completed");
  const failedRows = rows.filter((row) => row.status === "failed");
  const processedCount = rows.filter((row) => terminalStatuses.has(row.status)).length;
  const issueCount = rows.filter((row) => terminalStatuses.has(row.status) && !["completed", "cancelled"].includes(row.status)).length;
  const progress = rows.length ? Math.round((processedCount / rows.length) * 100) : 0;
  const readyCount = rows.filter((row) => row.status === "ready").length;
  const rankByInput = useMemo(() => rankBatchResults(rows.map((row) => ({
    key: row.input,
    score: row.report?.score.score ?? null,
    confidence: row.report?.score.confidence ?? null,
    coverage: row.report?.dataCoverage ?? null,
  }))), [rows]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      return undefined;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setIsSearching(true);
      void fetch(`/api/companies/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(async (response) => response.json() as Promise<{ companies?: CompanySearchResult[] }>)
        .then((payload) => setSearchResults(payload.companies ?? []))
        .catch((reason: unknown) => {
          if (!(reason instanceof DOMException && reason.name === "AbortError")) setSearchResults([]);
        })
        .finally(() => setIsSearching(false));
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [searchQuery]);

  function searchCompanies(value: string) {
    setSearchQuery(value);
    if (value.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
    }
  }

  function appendTicker(symbol: string) {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) return;
    if (parsed.symbols.includes(normalized)) return;
    setInput((current) => `${current.trimEnd()}${current.trim() ? "\n" : ""}${normalized}`);
    setRows([]);
    setError(null);
  }


  function removeTicker(symbol: string) {
    const next = parsed.symbols.filter((item) => item !== symbol);
    setInput(next.join("\n"));
    setRows([]);
    setError(null);
  }

  async function importFile(file?: File) {
    if (!file) return;
    if (file.size > 250_000) {
      setError(copy.fileTooLarge);
      return;
    }
    setInput(await file.text());
    setRows([]);
    setError(null);
  }
  async function validateBatch() {
    setError(null);
    setRows([]);
    if (!financialConfigured) {
      setError(copy.liveNotConfigured);
      return;
    }
    if (!parsed.symbols.length) {
      setError(copy.enterTicker);
      return;
    }
    if (parsed.invalid.length) {
      setError(`${copy.removeInvalid}: ${parsed.invalid.slice(0, 6).join(", ")}.`);
      return;
    }
    if (parsed.overLimit) {
      setError(copy.overLimit);
      return;
    }

    setIsResolving(true);
    try {
      const response = await fetch("/api/batch/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: parsed.symbols }),
      });
      const payload = (await response.json()) as ResolvePayload;
      if (!response.ok || !payload.items) {
        setError(response.status === 429 ? copy.rateLimited : (locale === "en" ? (payload.error ?? copy.validationFailed) : copy.validationFailed));
        setEntitlement(payload.entitlement);
        return;
      }
      setRows(payload.items);
      setEntitlement(payload.entitlement);
    } catch {
      setError(copy.validationConnection);
    } finally {
      setIsResolving(false);
    }
  }

  const refreshDurableBatch = useCallback(async (batchId: string) => {
    const response = await fetch(`/api/batch/runs/${encodeURIComponent(batchId)}`, { cache: "no-store" });
    const payload = (await response.json()) as DurableBatchPayload;
    if (!response.ok || !payload.run || !payload.items) {
      if (response.status === 404) {
        window.localStorage.removeItem(LAST_BATCH_STORAGE_KEY);
        setCurrentBatchId(null);
      }
      if (!response.ok) setError(payload.error ?? copy.connectionInterrupted);
      return;
    }

    const itemByInput = new Map(payload.items.map((item) => [item.input_ticker.toUpperCase(), item]));
    const rowForItem = (item: DurableBatchItemPayload, existing?: BatchRow): BatchRow => {
      const status: BatchStatus = item.status === "completed"
        ? "completed"
        : item.status === "failed"
          ? "failed"
          : item.status === "cancelled"
            ? "cancelled"
            : "running";
      return {
        ...existing,
        input: item.input_ticker,
        status,
        report: item.report ?? existing?.report,
        error: item.last_error ? localizedBatchError(item.last_error, copy.connectionInterrupted, copy.monthlyLimit, copy.rateLimited) : (item.status === "cancelled" ? copy.stopAfterCurrent : undefined),
      };
    };
    setRows((current) => {
      if (!current.length) return payload.items!.map((item) => rowForItem(item));
      return current.map((row) => {
        const item = itemByInput.get(row.input.toUpperCase());
        return item ? rowForItem(item, row) : row;
      });
    });

    const terminal = ["completed", "partial", "failed", "cancelled"].includes(payload.run.status);
    setIsRunning(!terminal);
    if (terminal) {
      const completedCount = payload.items.filter((item) => item.status === "completed").length;
      const failedCount = payload.items.filter((item) => item.status === "failed").length;
      captureClientEvent("batch_completed", { count: payload.items.length, completedCount, failedCount });
    }
  }, [copy.connectionInterrupted, copy.monthlyLimit, copy.rateLimited, copy.stopAfterCurrent]);

  useEffect(() => {
    if (currentBatchId) return undefined;
    const savedBatchId = window.localStorage.getItem(LAST_BATCH_STORAGE_KEY);
    if (!savedBatchId) return undefined;
    const restore = window.setTimeout(() => {
      setCurrentBatchId(savedBatchId);
      void refreshDurableBatch(savedBatchId);
    }, 0);
    return () => window.clearTimeout(restore);
  }, [currentBatchId, refreshDurableBatch]);

  useEffect(() => {
    if (!currentBatchId || !isRunning) return undefined;
    const initialPoll = window.setTimeout(() => void refreshDurableBatch(currentBatchId), 0);
    const interval = window.setInterval(() => void refreshDurableBatch(currentBatchId), 2_000);
    return () => {
      window.clearTimeout(initialPoll);
      window.clearInterval(interval);
    };
  }, [currentBatchId, isRunning, refreshDurableBatch]);

  async function executeBatch(candidates: BatchRow[]) {
    if (!candidates.length || isRunning) return;
    setError(null);
    setIsRunning(true);

    if (currentBatchId && candidates.every((candidate) => candidate.status === "failed")) {
      setRows((current) => current.map((row) => row.status === "failed" ? { ...row, status: "running", error: undefined } : row));
      const retryResponse = await fetch(`/api/batch/runs/${encodeURIComponent(currentBatchId)}/retry`, { method: "POST" });
      if (!retryResponse.ok) {
        const payload = await retryResponse.json().catch(() => ({})) as { error?: string };
        setError(payload.error ?? copy.connectionInterrupted);
        setIsRunning(false);
        return;
      }
      captureClientEvent("batch_started", { count: candidates.length, analysisType, retry: true });
      await refreshDurableBatch(currentBatchId);
      return;
    }

    const runnable = candidates.filter((candidate): candidate is BatchRow & { company: CompanySearchResult } => Boolean(candidate.company));
    const response = await fetch("/api/batch/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        analysisType,
        investmentProfile,
        items: runnable.map((candidate) => ({ input: candidate.input, company: candidate.company })),
      }),
    });
    const payload = await response.json().catch(() => ({})) as { batchId?: string; error?: string };
    if (!response.ok || !payload.batchId) {
      setError(response.status === 429 ? copy.rateLimited : localizedBatchError(payload.error, copy.connectionInterrupted, copy.monthlyLimit, copy.rateLimited));
      setIsRunning(false);
      return;
    }
    setCurrentBatchId(payload.batchId);
    window.localStorage.setItem(LAST_BATCH_STORAGE_KEY, payload.batchId);
    setRows((current) => current.map((row) => runnable.some((candidate) => candidate.input === row.input)
      ? { ...row, status: "running", error: undefined }
      : row));
    captureClientEvent("batch_started", { count: runnable.length, analysisType, durable: true });
    await refreshDurableBatch(payload.batchId);
  }

  async function stopBatch() {
    if (!currentBatchId) return;
    await fetch(`/api/batch/runs/${encodeURIComponent(currentBatchId)}/cancel`, { method: "POST" });
    setError(copy.stopAfterCurrent);
    await refreshDurableBatch(currentBatchId);
  }

  function resetBatch() {
    if (isRunning) return;
    setRows([]);
    setEntitlement(undefined);
    setCurrentBatchId(null);
    window.localStorage.removeItem(LAST_BATCH_STORAGE_KEY);
    setError(null);
  }

  function exportCsv() {
    const header = [
      "Rank",
      "Ticker",
      "Company",
      "Status",
      "Score",
      "Confidence",
      "Model rating",
      "Research view",
      "Data coverage",
      "Analysis ID",
      "Error",
    ];
    const data = rows.map((row) => [
      rankByInput[row.input] ?? "",
      row.company?.canonicalTicker ?? row.company?.ticker ?? row.input,
      row.company?.name ?? "",
      statusLabel(row.status, copy),
      row.report?.score.score ?? "",
      row.report?.score.confidence ?? "",
      row.report?.recommendation ?? "",
      row.report ? localizedResearchView(researchViewForReport(row.report), locale) : "",
      row.report?.dataCoverage ?? "",
      row.report?.id ?? "",
      row.error ?? "",
    ]);
    const csv = [header, ...data].map((line) => line.map(csvCell).join(",")).join("\r\n");
    downloadFile(
      `stockbox-batch-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      "text/csv;charset=utf-8",
    );
  }

  async function exportZip() {
    const analysisIds = completedRows.map((row) => row.report?.id).filter((id): id is string => Boolean(id));
    if (!analysisIds.length || isExporting) return;
    setIsExporting(true);
    setError(null);
    try {
      const response = await fetch("/api/batch/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ analysisIds }) });
      if (!response.ok) { setError(locale === "sv" ? "ZIP-exporten kunde inte skapas." : "The ZIP export could not be created."); return; }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `StockBox_Batch_${new Date().toISOString().slice(0, 10)}.zip`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(locale === "sv" ? "ZIP-exporten kunde inte laddas ner. Försök igen." : "The ZIP export could not be downloaded. Try again.");
    } finally { setIsExporting(false); }
  }

  function exportQaJson() {
    downloadFile(
      `stockbox-batch-qa-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        analysisType,
        investmentProfile,
        results: rows,
      }, null, 2),
      "application/json",
    );
  }
  return (
    <div className="space-y-6">
      {!financialConfigured ? (
        <SetupNotice
          title={copy.setupTitle}
          detail={copy.setupDetail}
        />
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="border-b border-white/10 bg-white/[0.03] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#e1cb95]">{copy.step1}</p>
              <h2 className="mt-1 text-lg font-semibold text-[#f4efe5]">{copy.addCompanies}</h2>
            </div>
            <span className="rounded-full border border-white/10 bg-[#07111f] px-3 py-1 text-xs text-[#c9d2df]">
              {parsed.symbols.length}/{MAX_BATCH_ROWS} {copy.uniqueTickers}
            </span>
          </div>
        </div>
        <div className="p-5">
          <div className="mb-4 rounded-md border border-white/10 bg-white/[0.03] p-4">
            <label htmlFor="batch-company-search" className="text-sm font-semibold text-[#f4efe5]">
              {copy.searchAndAdd}
            </label>
            <div className="mt-2 flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#9aa7b8]" aria-hidden="true" />
                <input
                  id="batch-company-search"
                  value={searchQuery}
                  onChange={(event) => void searchCompanies(event.target.value)}
                  disabled={isRunning}
                  placeholder={copy.searchPlaceholder}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-controls="batch-company-search-results"
                  aria-expanded={searchResults.length > 0}
                  className="h-10 w-full rounded-md border border-white/12 bg-[#07111f] pl-9 pr-3 text-sm text-[#f4efe5] placeholder:text-[#6f7b8c]"
                />
              </div>
              {isSearching ? <LoaderCircle className="mt-2.5 h-5 w-5 animate-spin text-[#e1cb95]" aria-hidden="true" /> : null}
            </div>
            {searchResults.length ? (
              <div id="batch-company-search-results" role="listbox" className="mt-3 grid gap-2 md:grid-cols-2">
                {searchResults.slice(0, 6).map((company) => {
                  const symbol = company.canonicalTicker ?? company.ticker;
                  const alreadyAdded = parsed.symbols.includes(symbol.toUpperCase());
                  return (
                    <button
                      key={`${company.ticker}-${company.name}`}
                      type="button"
                      onClick={() => appendTicker(symbol)}
                      disabled={isRunning || alreadyAdded}
                      role="option"
                      aria-selected={alreadyAdded}
                      className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-[#07111f] p-3 text-left hover:bg-white/5 disabled:opacity-60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-[#f4efe5]">{company.name}</span>
                        <span className="mt-1 block text-xs text-[#9aa7b8]">{symbol}{company.exchange ? ` · ${company.exchange}` : ""}{company.country ? ` · ${company.country}` : ""}</span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#e1cb95]">
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        {alreadyAdded ? copy.alreadyAdded : copy.addTicker}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : searchQuery.trim().length >= 2 && !isSearching ? (
              <p className="mt-3 text-sm text-[#9aa7b8]">{analyzeCopy.noMatch}</p>
            ) : null}
          </div>
          <label htmlFor="batch-tickers" className="text-sm font-semibold text-[#f4efe5]">
            {copy.tickerSymbols}
          </label>
          <textarea
            id="batch-tickers"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setRows([]);
              setError(null);
            }}
            rows={6}
            disabled={isRunning}
            placeholder="AAPL, MSFT, NVDA, JPM, VOLV-B.ST..."
            className="mt-2 w-full resize-y rounded-md border border-white/12 bg-[#07111f] p-3 font-mono text-sm leading-6 text-[#f4efe5] placeholder:text-[#6f7b8c]"
          />
          {parsed.symbols.length ? (
            <div className="mt-3 rounded-md border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#e1cb95]">{copy.selectedTickers}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {parsed.symbols.slice(0, MAX_BATCH_ROWS).map((symbol) => (
                  <button
                    key={symbol}
                    type="button"
                    onClick={() => removeTicker(symbol)}
                    disabled={isRunning}
                    className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-[#07111f] px-2.5 py-1.5 font-mono text-xs font-semibold text-[#f4efe5] hover:bg-white/8 disabled:opacity-60"
                    aria-label={`${copy.removeTicker}: ${symbol}`}
                  >
                    {symbol}
                    <XCircle className="h-3.5 w-3.5 text-[#9aa7b8]" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-white/15 bg-white/7 px-4 text-sm font-semibold text-[#f4efe5] hover:bg-white/12">
              <FileUp className="h-4 w-4" aria-hidden="true" />
              {copy.importFile}
              <input
                type="file"
                accept=".txt,.csv,text/plain,text/csv"
                className="sr-only"
                disabled={isRunning}
                onChange={(event) => void importFile(event.target.files?.[0])}
              />
            </label>
            <p className="text-xs text-[#9aa7b8]">
              {copy.separators}
            </p>
          </div>
          {parsed.duplicates.length ? (
            <p className="mt-3 text-xs text-[#e1cb95]">
              {parsed.duplicates.length} {parsed.duplicates.length === 1 ? copy.duplicateRemoved : copy.duplicatesRemoved}.
            </p>
          ) : null}
          {parsed.invalid.length ? (
            <p className="mt-2 text-xs text-red-200">
              {copy.invalid}: {parsed.invalid.slice(0, 8).join(", ")}
            </p>
          ) : null}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#e1cb95]">{copy.step2}</p>
            <h2 className="mt-1 text-lg font-semibold text-[#f4efe5]">{copy.configure}</h2>
          </div>
          {entitlement ? (
            <span className="text-xs text-[#9aa7b8]">
              {entitlement.plan} plan · {entitlement.rowLimit} {copy.rowsPerBatch}
            </span>
          ) : null}
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-semibold text-[#f4efe5]">{copy.reportType}</span>
            <select
              value={analysisType}
              onChange={(event) => setAnalysisType(event.target.value as AnalysisType)}
              disabled={isRunning}
              className="h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-[#f4efe5]"
            >
              <option value="summary">{analyzeCopy.summary}</option>
              <option value="numbers">{analyzeCopy.numbers}</option>
              <option value="deep">{analyzeCopy.deep}</option>
              <option value="research">{analyzeCopy.research}</option>
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-semibold text-[#f4efe5]">{copy.investmentProfile}</span>
            <select
              value={investmentProfile}
              onChange={(event) => setInvestmentProfile(event.target.value as InvestmentProfile)}
              disabled={isRunning}
              className="h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-[#f4efe5]"
            >
              <option value="balanced">{analyzeCopy.balanced}</option>
              <option value="long_term">{analyzeCopy.longTerm}</option>
              <option value="short_term">{analyzeCopy.shortTerm}</option>
              <option value="growth">{analyzeCopy.growth}</option>
              <option value="value">{analyzeCopy.value}</option>
              <option value="quality">{analyzeCopy.quality}</option>
              <option value="dividend">{analyzeCopy.dividend}</option>
              <option value="defensive">{analyzeCopy.defensive}</option>
            </select>
          </label>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => void validateBatch()}
            disabled={!financialConfigured || isResolving || isRunning || !parsed.symbols.length}
          >
            {isResolving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            {isResolving ? copy.validating : copy.validate}
          </Button>
          {rows.length && !isRunning ? (
            <Button type="button" variant="ghost" onClick={resetBatch}>
              {copy.clear}
            </Button>
          ) : null}
          <p className="text-xs leading-5 text-[#9aa7b8]">
            {copy.successfulUsesOne}
          </p>
        </div>
      </Card>

      {error ? <SetupNotice title={copy.notice} detail={error} /> : null}

      {rows.length ? (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#e1cb95]">{copy.step3}</p>
                <h2 className="mt-1 text-lg font-semibold text-[#f4efe5]">{copy.runReview}</h2>
                <p className="mt-1 text-xs text-[#9aa7b8]">
                  {copy.keepOpen}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!isRunning && readyCount ? (
                  <Button type="button" onClick={() => void executeBatch(rows.filter((row) => row.status === "ready"))}>
                    <Play className="h-4 w-4" aria-hidden="true" />
                    {copy.run} {readyCount}
                  </Button>
                ) : null}
                {isRunning ? (
                  <Button type="button" variant="danger" onClick={stopBatch}>
                    <Square className="h-4 w-4" aria-hidden="true" />
                    {copy.stopSafely}
                  </Button>
                ) : null}
                {!isRunning && failedRows.length ? (
                  <Button type="button" variant="secondary" onClick={() => void executeBatch(failedRows)}>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    {copy.retry} {failedRows.length}
                  </Button>
                ) : null}
              </div>
            </div>
            <div
              className="mt-4 h-2 overflow-hidden rounded-full bg-white/8"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-[#b99b5f] transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#9aa7b8]">
              <span>{processedCount}/{rows.length} {copy.processed}</span>
              <span className="text-emerald-200">{completedRows.length} {copy.completed}</span>
              <span className="text-red-200">{issueCount} {copy.issues}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-[#9aa7b8]">
                <tr>
                  <th className="px-5 py-3 text-right font-semibold">{copy.rank}</th>
                  <th className="px-5 py-3 font-semibold">{copy.ticker}</th>
                  <th className="px-5 py-3 font-semibold">{copy.company}</th>
                  <th className="px-5 py-3 font-semibold">{copy.status}</th>
                  <th className="px-5 py-3 text-right font-semibold">{copy.score}</th>
                  <th className="px-5 py-3 font-semibold">{copy.recommendation}</th>
                  <th className="px-5 py-3 font-semibold">{locale === "sv" ? "Researchvy" : "Research view"}</th>
                  <th className="px-5 py-3 text-right font-semibold">{copy.coverage}</th>
                  <th className="px-5 py-3 font-semibold">{copy.result}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {rows.map((row) => (
                  <tr key={row.input} className="text-[#c9d2df]">
                    <td className="number px-5 py-4 text-right font-semibold text-[#e1cb95]">
                      {rankByInput[row.input] ?? "—"}
                    </td>
                    <td className="px-5 py-4 font-mono font-semibold text-[#f4efe5]">
                      {row.company?.canonicalTicker ?? row.company?.ticker ?? row.input}
                    </td>
                    <td className="max-w-xs px-5 py-4">
                      <span className="block truncate">{row.company?.name ?? "—"}</span>
                      {row.report?.generatedAt ? <span className="mt-1 block text-xs text-[#7f8da0]">{formatAnalysisTimestamp(row.report.generatedAt, locale)}</span> : null}
                      {row.error ? <span className="mt-1 block text-xs text-red-200">{row.error}</span> : null}
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-2">
                        <StatusIcon status={row.status} />
                        {statusLabel(row.status, copy)}
                      </span>
                    </td>
                    <td className="number px-5 py-4 text-right text-[#f4efe5]">
                      {row.report?.score.score === null || row.report?.score.score === undefined ? "—" : Math.round(row.report.score.score)}
                    </td>
                    <td className="px-5 py-4 font-semibold text-[#e1cb95]">{row.report?.recommendation ?? "?"}</td>
                    <td className="px-5 py-4 font-semibold text-[#e1cb95]">
                      {row.report ? localizedResearchView(researchViewForReport(row.report), locale) : "—"}
                    </td>
                    <td className="number px-5 py-4 text-right">
                      {row.report?.dataCoverage === undefined
                        ? "—"
                        : `${Math.round(row.report.dataCoverage * 100)}%`}
                    </td>
                    <td className="px-5 py-4">
                      {row.report?.id ? (
                        <Link className="font-semibold text-[#e1cb95] hover:text-[#f4efe5]" href={`/analysis/${row.report.id}`}>
                          {copy.openReport}
                        </Link>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {completedRows.length ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-white/[0.03] px-5 py-4">
              <p className="text-xs leading-5 text-[#9aa7b8]">
                {copy.exportQaCopy}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void exportZip()} disabled={isExporting}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {isExporting ? (locale === "sv" ? "Skapar ZIP..." : "Building ZIP...") : (locale === "sv" ? `Ladda ner ${completedRows.length} färdiga rapporter (.zip)` : `Download ${completedRows.length} completed reports (.zip)`)}
                </Button>
                <Button type="button" variant="secondary" onClick={exportCsv}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {copy.downloadCsv}
                </Button>
                <Button type="button" variant="secondary" onClick={exportQaJson}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {copy.downloadQa}
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
