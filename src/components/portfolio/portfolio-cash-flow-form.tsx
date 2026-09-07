import { Button } from "@/components/ui/button";
import { recordPortfolioDividendAction, recordPortfolioFeeAction } from "@/lib/workspace/actions";

type Props = {
  portfolioId: string;
  ticker: string;
  currency: string;
  today: string;
  locale: "sv" | "en";
};

export function PortfolioCashFlowForm({ portfolioId, ticker, currency, today, locale }: Props) {
  const sv = locale === "sv";

  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      <details className="rounded-lg border border-white/10 bg-white/[0.025]">
        <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-[#c9d2df] hover:text-[#f4efe5]">
          {sv ? "Registrera utdelning" : "Record dividend"}
        </summary>
        <form action={recordPortfolioDividendAction} className="grid gap-3 border-t border-white/10 p-3">
          <input type="hidden" name="portfolioId" value={portfolioId} />
          <input type="hidden" name="ticker" value={ticker} />
          <input type="hidden" name="currency" value={currency} />
          <label className="text-[10px] text-[#7f8b9b]">
            {sv ? `Utdelning (${currency})` : `Dividend amount (${currency})`}
            <input
              name="amount"
              required
              type="number"
              min="0.00000001"
              step="any"
              className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-2 text-sm text-[#f4efe5]"
            />
          </label>
          <label className="text-[10px] text-[#7f8b9b]">
            {sv ? "Datum" : "Date"}
            <input
              name="transactionDate"
              required
              type="date"
              max={today}
              defaultValue={today}
              className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-2 text-sm text-[#f4efe5]"
            />
          </label>
          <p className="text-[10px] leading-4 text-[#7f8b9b]">
            {sv
              ? "Registrera kontantbeloppet du vill följa. Källskatt modelleras inte separat i den här versionen."
              : "Record the cash amount you want to track. Withholding tax is not modeled separately in this version."}
          </p>
          <Button className="min-h-10">{sv ? "Registrera utdelning" : "Record dividend"}</Button>
        </form>
      </details>

      <details className="rounded-lg border border-white/10 bg-white/[0.025]">
        <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-[#c9d2df] hover:text-[#f4efe5]">
          {sv ? "Registrera avgift" : "Record fee"}
        </summary>
        <form action={recordPortfolioFeeAction} className="grid gap-3 border-t border-white/10 p-3">
          <input type="hidden" name="portfolioId" value={portfolioId} />
          <input type="hidden" name="ticker" value={ticker} />
          <input type="hidden" name="currency" value={currency} />
          <label className="text-[10px] text-[#7f8b9b]">
            {sv ? `Avgift (${currency})` : `Fee amount (${currency})`}
            <input
              name="amount"
              required
              type="number"
              min="0.00000001"
              step="any"
              className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-2 text-sm text-[#f4efe5]"
            />
          </label>
          <label className="text-[10px] text-[#7f8b9b]">
            {sv ? "Datum" : "Date"}
            <input
              name="transactionDate"
              required
              type="date"
              max={today}
              defaultValue={today}
              className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-2 text-sm text-[#f4efe5]"
            />
          </label>
          <p className="text-[10px] leading-4 text-[#7f8b9b]">
            {sv
              ? `Endast fristående avgift kopplad till ${ticker}. Köp- och säljcourtage registreras i köp-/säljtransaktionen.`
              : `Only standalone fees tied to ${ticker}. Buy and sell commissions belong in the purchase or sale transaction.`}
          </p>
          <Button className="min-h-10">{sv ? "Registrera avgift" : "Record fee"}</Button>
        </form>
      </details>
    </div>
  );
}
