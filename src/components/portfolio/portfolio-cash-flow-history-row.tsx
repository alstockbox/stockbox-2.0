import { Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updatePortfolioCashFlowTransactionAction } from "@/lib/workspace/portfolio-cash-flow-actions";
import { removePortfolioTransactionAction } from "@/lib/workspace/actions";

type Props = {
  id: string;
  ticker: string;
  transactionType: "fee" | "dividend";
  cashAmount: number | string | null;
  currency: string;
  executedAt: string;
  today: string;
  locale: "sv" | "en";
};

export function PortfolioCashFlowHistoryRow({
  id,
  ticker,
  transactionType,
  cashAmount,
  currency,
  executedAt,
  today,
  locale,
}: Props) {
  const sv = locale === "sv";
  const amount = typeof cashAmount === "number" || typeof cashAmount === "string" ? cashAmount : undefined;
  const typeLabel = transactionType === "dividend"
    ? (sv ? "utdelning" : "dividend")
    : (sv ? "avgift" : "fee");

  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
      <div className="flex min-w-28 items-center gap-2 pb-2 lg:pb-2.5">
        <span className={`rounded px-2 py-1 text-[10px] font-semibold uppercase ${transactionType === "dividend" ? "bg-emerald-950/50 text-emerald-200" : "bg-red-950/50 text-red-200"}`}>
          {typeLabel}
        </span>
        <span className="font-mono text-sm font-semibold text-[#e1cb95]">{ticker}</span>
      </div>
      <form action={updatePortfolioCashFlowTransactionAction} className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
        <input type="hidden" name="id" value={id} />
        <label className="text-[10px] text-[#7f8b9b]">
          {sv ? "Belopp" : "Amount"}
          <input name="amount" required type="number" min="0.000001" step="any" defaultValue={amount} className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-2 text-sm text-[#f4efe5]" />
        </label>
        <label className="text-[10px] text-[#7f8b9b]">
          {sv ? "Valuta" : "Currency"}
          <input name="currency" required maxLength={3} pattern="[A-Za-z]{3}" defaultValue={currency} className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-2 text-sm uppercase text-[#f4efe5]" />
        </label>
        <label className="text-[10px] text-[#7f8b9b]">
          {sv ? "Datum" : "Date"}
          <input name="transactionDate" required type="date" max={today} defaultValue={executedAt} className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-2 text-sm text-[#f4efe5]" />
        </label>
        <Button className="min-h-10 self-end"><Save className="h-4 w-4" />{sv ? "Spara kassaflöde" : "Save cash flow"}</Button>
      </form>
      <form action={removePortfolioTransactionAction}>
        <input type="hidden" name="id" value={id} />
        <Button variant="ghost" className="min-h-10" title={sv ? "Ta bort transaktion" : "Delete transaction"}>
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">{sv ? "Ta bort" : "Delete"} {typeLabel} {ticker}</span>
        </Button>
      </form>
    </div>
  );
}
