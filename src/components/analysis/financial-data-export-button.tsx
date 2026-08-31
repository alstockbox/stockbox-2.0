"use client";

import { Download } from "lucide-react";
import { historicalFinancialsCsv } from "@/lib/analysis/financial-data-export";
import type { HistoricalResearchData } from "@/lib/analysis/types";

function safeFilePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "stockbox";
}

export function FinancialDataExportButton({
  ticker,
  historical,
  label = "Download CSV",
}: {
  ticker: string;
  historical: HistoricalResearchData;
  label?: string;
}) {
  function download() {
    const csv = historicalFinancialsCsv(historical);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFilePart(ticker)}-stockbox-financials.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="inline-flex items-center gap-2 rounded-md border border-[#b99b5f]/30 px-3 py-2 text-xs font-semibold text-[#e1cb95] hover:bg-[#b99b5f]/10"
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}
