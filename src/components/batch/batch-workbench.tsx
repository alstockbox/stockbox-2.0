"use client";

import Link from "next/link";
import {
  CheckCircle2,
  CircleDashed,
  Download,
  FileUp,
  LoaderCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  XCircle,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type {
  AnalysisReport,
  AnalysisType,
  CompanySearchResult,
  InvestmentProfile,
} from "@/lib/analysis/types";
import { MAX_BATCH_ROWS, parseBatchInput } from "@/lib/batch/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SetupNotice } from "@/components/ui/setup-notice";
type BatchStatus =
  | "ready"
  | "not_found"
  | "unsupported"
  | "lookup_failed"
  | "running"
  | "completed"
  | "failed";

type BatchRow = {
  input: string;
  company?: CompanySearchResult;
  status: BatchStatus;
  error?: string;
  report?: AnalysisReport;
};

type ResolvePayload = {
  error?: string;
  items?: BatchRow[];
  entitlement?: { plan: string; rowLimit: number };
};

type AnalysisPayload =
  | { ok: true; data: AnalysisReport; persisted: boolean; warnings: string[] }
  | { ok: false; error: string; warnings?: string[] }
  | { error: string };
const terminalStatuses = new Set<BatchStatus>([
  "completed",
  "failed",
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

function statusLabel(status: BatchStatus) {
  return {
    ready: "Ready",
    running: "Analyzing",
    completed: "Completed",
    failed: "Failed",
    not_found: "Not found",
    unsupported: "Unsupported",
    lookup_failed: "Lookup failed",
  }[status];
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

export function BatchWorkbench({ financialConfigured }: { financialConfigured: boolean }) {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [analysisType, setAnalysisType] = useState<AnalysisType>("summary");
  const [investmentProfile, setInvestmentProfile] = useState<InvestmentProfile>("balanced");
  const [entitlement, setEntitlement] = useState<ResolvePayload["entitlement"]>();
  const [isResolving, setIsResolving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  const parsed = useMemo(() => parseBatchInput(input), [input]);
  const completedRows = rows.filter((row) => row.status === "completed");
  const failedRows = rows.filter((row) => row.status === "failed");
  const processedCount = rows.filter((row) => terminalStatuses.has(row.status)).length;
  const progress = rows.length ? Math.round((processedCount / rows.length) * 100) : 0;
  const readyCount = rows.filter((row) => row.status === "ready").length;

  function updateRow(symbol: string, patch: Partial<BatchRow>) {
    setRows((current) =>
      current.map((row) => row.input === symbol ? { ...row, ...patch } : row),
    );
  }

  async function importFile(file?: File) {
    if (!file) return;
    if (file.size > 250_000) {
      setError("The import file is too large. Use a TXT or CSV file below 250 KB.");
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
      setError("Live financial data is not configured for this deployment.");
      return;
    }
    if (!parsed.symbols.length) {
      setError("Enter at least one ticker symbol.");
      return;
    }
    if (parsed.invalid.length) {
      setError(`Remove invalid values: ${parsed.invalid.slice(0, 6).join(", ")}.`);
      return;
    }
    if (parsed.overLimit) {
      setError(`A release batch can contain at most ${MAX_BATCH_ROWS} unique companies.`);
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
        setError(payload.error ?? "The batch could not be validated.");
        setEntitlement(payload.entitlement);
        return;
      }
      setRows(payload.items);
      setEntitlement(payload.entitlement);
    } catch {
      setError("The batch could not be validated. Check your connection and try again.");
    } finally {
      setIsResolving(false);
    }
  }

  async function executeBatch(candidates: BatchRow[]) {
    if (!candidates.length || isRunning) return;
    cancelled.current = false;
    setError(null);
    setIsRunning(true);

    for (const candidate of candidates) {
      if (cancelled.current) break;
      if (!candidate.company) continue;
      updateRow(candidate.input, { status: "running", error: undefined });
      try {
        const response = await fetch("/api/analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company: candidate.company,
            analysisType,
            investmentProfile,
          }),
        });
        const payload = (await response.json()) as AnalysisPayload;
        if (response.ok && "ok" in payload && payload.ok && payload.persisted) {
          updateRow(candidate.input, {
            status: "completed",
            report: payload.data,
            error: undefined,
          });
          continue;
        }

        const message =
          "error" in payload
            ? payload.error
            : "Analysis completed but could not be saved. Try again.";
        updateRow(candidate.input, { status: "failed", error: message });
        if (response.status === 429) {
          setError("Your monthly analysis limit has been reached. Unstarted companies remain ready.");
          break;
        }
      } catch {
        updateRow(candidate.input, {
          status: "failed",
          error: "Connection interrupted. This company can be retried safely.",
        });
      }
    }
    setIsRunning(false);
  }

  function stopBatch() {
    cancelled.current = true;
    setError("The batch will stop after the current company finishes.");
  }

  function resetBatch() {
    if (isRunning) return;
    setRows([]);
    setEntitlement(undefined);
    setError(null);
  }

  function exportCsv() {
    const header = [
      "Ticker",
      "Company",
      "Status",
      "Score",
      "Confidence",
      "Recommendation",
      "Data coverage",
      "Analysis ID",
      "Error",
    ];
    const data = rows.map((row) => [
      row.company?.canonicalTicker ?? row.company?.ticker ?? row.input,
      row.company?.name ?? "",
      statusLabel(row.status),
      row.report?.score.score ?? "",
      row.report?.score.confidence ?? "",
      row.report?.recommendation ?? "",
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
          title="Live analysis provider setup required"
          detail="Batch analysis is unavailable until the financial provider is configured."
        />
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="border-b border-white/10 bg-white/[0.03] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#e1cb95]">Step 1</p>
              <h2 className="mt-1 text-lg font-semibold text-[#f4efe5]">Add companies</h2>
            </div>
            <span className="rounded-full border border-white/10 bg-[#07111f] px-3 py-1 text-xs text-[#c9d2df]">
              {parsed.symbols.length}/{MAX_BATCH_ROWS} unique tickers
            </span>
          </div>
        </div>
        <div className="p-5">
          <label htmlFor="batch-tickers" className="text-sm font-semibold text-[#f4efe5]">
            Ticker symbols
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
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-white/15 bg-white/7 px-4 text-sm font-semibold text-[#f4efe5] hover:bg-white/12">
              <FileUp className="h-4 w-4" aria-hidden="true" />
              Import TXT or CSV
              <input
                type="file"
                accept=".txt,.csv,text/plain,text/csv"
                className="sr-only"
                disabled={isRunning}
                onChange={(event) => void importFile(event.target.files?.[0])}
              />
            </label>
            <p className="text-xs text-[#9aa7b8]">
              Commas, spaces, semicolons and new lines are supported.
            </p>
          </div>
          {parsed.duplicates.length ? (
            <p className="mt-3 text-xs text-[#e1cb95]">
              {parsed.duplicates.length} duplicate ticker{parsed.duplicates.length === 1 ? "" : "s"} removed automatically.
            </p>
          ) : null}
          {parsed.invalid.length ? (
            <p className="mt-2 text-xs text-red-200">
              Invalid: {parsed.invalid.slice(0, 8).join(", ")}
            </p>
          ) : null}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#e1cb95]">Step 2</p>
            <h2 className="mt-1 text-lg font-semibold text-[#f4efe5]">Configure the batch</h2>
          </div>
          {entitlement ? (
            <span className="text-xs text-[#9aa7b8]">
              {entitlement.plan} plan · {entitlement.rowLimit} rows per batch
            </span>
          ) : null}
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-semibold text-[#f4efe5]">Report type</span>
            <select
              value={analysisType}
              onChange={(event) => setAnalysisType(event.target.value as AnalysisType)}
              disabled={isRunning}
              className="h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-[#f4efe5]"
            >
              <option value="summary">Summary</option>
              <option value="numbers">Numbers</option>
              <option value="deep">Deep</option>
              <option value="research">Research / Extra Deep</option>
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-semibold text-[#f4efe5]">Investment profile</span>
            <select
              value={investmentProfile}
              onChange={(event) => setInvestmentProfile(event.target.value as InvestmentProfile)}
              disabled={isRunning}
              className="h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-[#f4efe5]"
            >
              <option value="balanced">Balanced</option>
              <option value="long_term">Long-term</option>
              <option value="short_term">Short-term</option>
              <option value="growth">Growth</option>
              <option value="value">Value</option>
              <option value="quality">Quality</option>
              <option value="dividend">Dividend</option>
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
            {isResolving ? "Validating" : "Validate companies"}
          </Button>
          {rows.length && !isRunning ? (
            <Button type="button" variant="ghost" onClick={resetBatch}>
              Clear validation
            </Button>
          ) : null}
          <p className="text-xs leading-5 text-[#9aa7b8]">
            Each successful report uses one monthly analysis. Failed attempts are released automatically.
          </p>
        </div>
      </Card>

      {error ? <SetupNotice title="Batch notice" detail={error} /> : null}

      {rows.length ? (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#e1cb95]">Step 3</p>
                <h2 className="mt-1 text-lg font-semibold text-[#f4efe5]">Run and review</h2>
                <p className="mt-1 text-xs text-[#9aa7b8]">
                  Keep this tab open while the queue is running.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!isRunning && readyCount ? (
                  <Button type="button" onClick={() => void executeBatch(rows.filter((row) => row.status === "ready"))}>
                    <Play className="h-4 w-4" aria-hidden="true" />
                    Run {readyCount}
                  </Button>
                ) : null}
                {isRunning ? (
                  <Button type="button" variant="danger" onClick={stopBatch}>
                    <Square className="h-4 w-4" aria-hidden="true" />
                    Stop safely
                  </Button>
                ) : null}
                {!isRunning && failedRows.length ? (
                  <Button type="button" variant="secondary" onClick={() => void executeBatch(failedRows)}>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Retry {failedRows.length}
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-[#b99b5f] transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#9aa7b8]">
              <span>{processedCount}/{rows.length} processed</span>
              <span className="text-emerald-200">{completedRows.length} completed</span>
              <span className="text-red-200">{rows.length - readyCount - completedRows.length - (isRunning ? 1 : 0)} issues or failures</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-[#9aa7b8]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Ticker</th>
                  <th className="px-5 py-3 font-semibold">Company</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold">Score</th>
                  <th className="px-5 py-3 text-right font-semibold">Coverage</th>
                  <th className="px-5 py-3 font-semibold">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {rows.map((row) => (
                  <tr key={row.input} className="text-[#c9d2df]">
                    <td className="px-5 py-4 font-mono font-semibold text-[#f4efe5]">
                      {row.company?.canonicalTicker ?? row.company?.ticker ?? row.input}
                    </td>
                    <td className="max-w-xs px-5 py-4">
                      <span className="block truncate">{row.company?.name ?? "—"}</span>
                      {row.error ? <span className="mt-1 block text-xs text-red-200">{row.error}</span> : null}
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-2">
                        <StatusIcon status={row.status} />
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="number px-5 py-4 text-right text-[#f4efe5]">
                      {row.report?.score.score ?? "—"}
                    </td>
                    <td className="number px-5 py-4 text-right">
                      {row.report?.dataCoverage === undefined
                        ? "—"
                        : `${Math.round(row.report.dataCoverage * 100)}%`}
                    </td>
                    <td className="px-5 py-4">
                      {row.report?.id ? (
                        <Link className="font-semibold text-[#e1cb95] hover:text-[#f4efe5]" href={`/analysis/${row.report.id}`}>
                          Open report
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
                Export the full QA file when you want the analysis engine reviewed and calibrated.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={exportCsv}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download CSV
                </Button>
                <Button type="button" variant="secondary" onClick={exportQaJson}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download QA JSON
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
