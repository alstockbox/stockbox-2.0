import { TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { recordPortfolioSaleAction } from "@/lib/workspace/actions";

type Props = {
  portfolioId: string;
  ticker: string;
  quantity: number;
  currency: string;
  today: string;
  locale: "sv" | "en";
};

export function PortfolioSaleForm({ portfolioId, ticker, quantity, currency, today, locale }: Props) {
  const sv = locale === "sv";
  const quantityLabel = quantity.toLocaleString(sv ? "sv-SE" : "en-GB", { maximumFractionDigits: 8 });

  return (
    <details className="mt-4 rounded-lg border border-white/10 bg-white/[0.025]">
      <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-[#c9d2df] hover:text-[#f4efe5]">
        {sv ? "Registrera försäljning" : "Record a sale"}
      </summary>
      <form action={recordPortfolioSaleAction} className="grid gap-3 border-t border-white/10 p-3 sm:grid-cols-2">
        <input type="hidden" name="portfolioId" value={portfolioId} />
        <input type="hidden" name="ticker" value={ticker} />
        <input type="hidden" name="currency" value={currency} />

        <label className="text-[10px] text-[#7f8b9b]">
          {sv ? "Antal att sälja" : "Quantity to sell"}
          <input
            name="quantity"
            required
            type="number"
            min="0.00000001"
            max={quantity}
            step="any"
            className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-2 text-sm text-[#f4efe5]"
          />
        </label>
        <label className="text-[10px] text-[#7f8b9b]">
          {sv ? `Försäljningspris (${currency})` : `Sale price (${currency})`}
          <input
            name="price"
            required
            type="number"
            min="0"
            step="any"
            className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-2 text-sm text-[#f4efe5]"
          />
        </label>
        <label className="text-[10px] text-[#7f8b9b]">
          {sv ? "Försäljningsdatum" : "Sale date"}
          <input
            name="saleDate"
            required
            type="date"
            max={today}
            defaultValue={today}
            className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-2 text-sm text-[#f4efe5]"
          />
        </label>
        <label className="text-[10px] text-[#7f8b9b]">
          {sv ? "Avgift" : "Fee"}
          <input
            name="fees"
            type="number"
            min="0"
            step="any"
            defaultValue="0"
            className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-2 text-sm text-[#f4efe5]"
          />
        </label>

        <p className="text-[10px] leading-4 text-[#7f8b9b] sm:col-span-2">
          {sv
            ? `Max ${quantityLabel} aktier. StockBox validerar även hela transaktionskedjan i datumordning innan försäljningen sparas.`
            : `Maximum ${quantityLabel} shares. StockBox also validates the full transaction chain in date order before the sale is saved.`}
        </p>
        <Button className="min-h-10 sm:col-span-2 sm:justify-self-start">
          <TrendingDown className="h-4 w-4" aria-hidden="true" />
          {sv ? `Registrera försäljning av ${ticker}` : `Record ${ticker} sale`}
        </Button>
      </form>
    </details>
  );
}
