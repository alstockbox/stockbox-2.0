"use client";

import { Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CompanySearchResult } from "@/lib/analysis/types";
import { addHoldingAction } from "@/lib/workspace/actions";
import { Button } from "@/components/ui/button";

type PortfolioOption = { id: string; name: string; baseCurrency: string };
type Props = { portfolios: PortfolioOption[]; locale: "sv" | "en"; today: string };

const STORAGE_KEY = "stockbox:last-portfolio-id";
const STORAGE_EVENT = "stockbox:portfolio-selection-change";

function subscribePortfolioSelection(onStoreChange: () => void) {
  window.addEventListener(STORAGE_EVENT, onStoreChange);
  return () => window.removeEventListener(STORAGE_EVENT, onStoreChange);
}

function storedPortfolioId(portfolios: PortfolioOption[], fallback: string) {
  const stored = window.sessionStorage.getItem(STORAGE_KEY);
  return stored && portfolios.some((portfolio) => portfolio.id === stored) ? stored : fallback;
}

function storePortfolioId(portfolioId: string) {
  window.sessionStorage.setItem(STORAGE_KEY, portfolioId);
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

export function PortfolioPurchaseForm({ portfolios, locale, today }: Props) {
  const sv = locale === "sv";
  const router = useRouter();
  const firstId = portfolios[0]?.id ?? "";
  const portfolioId = useSyncExternalStore(
    subscribePortfolioSelection,
    () => storedPortfolioId(portfolios, firstId),
    () => firstId,
  );
  const [query, setQuery] = useState("");
  const [ticker, setTicker] = useState("");
  const [results, setResults] = useState<CompanySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const searchSequence = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 1 || ticker) return;
    const sequence = ++searchSequence.current;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/companies/search?q=${encodeURIComponent(term)}`);
        const payload = await response.json().catch(() => ({})) as { companies?: CompanySearchResult[] };
        if (sequence === searchSequence.current) setResults(response.ok ? (payload.companies ?? []).slice(0, 6) : []);
      } catch {
        if (sequence === searchSequence.current) setResults([]);
      } finally {
        if (sequence === searchSequence.current) setSearching(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, ticker]);

  const selectedCompany = useMemo(() => results.find((company) => {
    const canonical = (company.canonicalTicker ?? company.ticker).toUpperCase();
    return canonical === ticker.toUpperCase();
  }) ?? null, [results, ticker]);

  function chooseCompany(company: CompanySearchResult) {
    const canonical = (company.canonicalTicker ?? company.ticker).trim().toUpperCase();
    searchSequence.current += 1;
    setTicker(canonical);
    setQuery(`${company.name} · ${canonical}`);
    setResults([]);
    setSearching(false);
    setMessage(null);
  }

  function clearSearch() {
    searchSequence.current += 1;
    setQuery("");
    setTicker("");
    setResults([]);
    setSearching(false);
  }

  async function submit(formData: FormData, form: HTMLFormElement) {
    if (saving) return;
    const canonicalTicker = ticker || query.trim().toUpperCase();
    if (!canonicalTicker) {
      setMessage(sv ? "Välj eller skriv in ett bolag först." : "Choose or enter a company first.");
      return;
    }
    formData.set("portfolioId", portfolioId);
    formData.set("ticker", canonicalTicker);
    setSaving(true);
    setMessage(null);
    try {
      await addHoldingAction(formData);
      const quantity = form.elements.namedItem("quantity") as HTMLInputElement | null;
      const averageCost = form.elements.namedItem("averageCost") as HTMLInputElement | null;
      const fees = form.elements.namedItem("fees") as HTMLInputElement | null;
      if (quantity) quantity.value = "";
      if (averageCost) averageCost.value = "";
      if (fees) fees.value = "0";
      clearSearch();
      storePortfolioId(portfolioId);
      setMessage(sv ? "Köpet är tillagt. Portföljvalet är kvar och bolagssökningen är rensad." : "Purchase added. Portfolio selection was kept and company search was cleared.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!portfolios.length) return <p className="mt-3 text-sm text-[#9aa7b8]">{sv ? "Skapa en portfölj först." : "Create a portfolio first."}</p>;

  return (
    <form
      className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(new FormData(event.currentTarget), event.currentTarget);
      }}
    >
      <select
        name="portfolioId"
        required
        value={portfolioId}
        onChange={(event) => storePortfolioId(event.target.value)}
        aria-label={sv ? "Portfölj" : "Portfolio"}
        className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3"
      >
        {portfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}
      </select>

      <div className="relative sm:col-span-1 xl:col-span-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[#6f7b8c]" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => {
              searchSequence.current += 1;
              setQuery(event.target.value);
              setTicker("");
              setResults([]);
              setSearching(false);
              setMessage(null);
            }}
            autoComplete="off"
            placeholder={sv ? "Sök bolag eller ticker" : "Search company or ticker"}
            aria-label={sv ? "Sök bolag eller ticker" : "Search company or ticker"}
            className="h-11 w-full rounded-md border border-white/12 bg-[#07111f] pl-9 pr-10"
          />
          {query ? <button type="button" onClick={clearSearch} className="absolute right-2 top-2.5 rounded p-1 text-[#8f9bac] hover:bg-white/8 hover:text-white" aria-label={sv ? "Rensa sökning" : "Clear search"}><X className="h-4 w-4" /></button> : null}
        </div>
        {searching ? <p className="absolute z-30 mt-1 w-full rounded-md border border-white/10 bg-[#081421] px-3 py-2 text-xs text-[#9aa7b8]">{sv ? "Söker…" : "Searching…"}</p> : null}
        {!searching && results.length ? (
          <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border border-white/12 bg-[#081421] p-1 shadow-2xl">
            {results.map((company) => {
              const canonical = company.canonicalTicker ?? company.ticker;
              return <button key={`${canonical}-${company.exchange ?? ""}`} type="button" onClick={() => chooseCompany(company)} className="flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left hover:bg-white/7"><span className="min-w-0"><span className="block truncate text-sm font-semibold text-[#e5ebf3]">{company.name}</span><span className="block truncate text-xs text-[#7f8b9b]">{company.exchange ?? company.country ?? ""}</span></span><span className="shrink-0 font-mono text-xs font-semibold text-[#e1cb95]">{canonical}</span></button>;
            })}
          </div>
        ) : null}
      </div>
      <input type="hidden" name="ticker" value={ticker || query.trim().toUpperCase()} />
      <input name="quantity" required type="number" min="0.000001" step="any" placeholder={sv ? "Antal" : "Quantity"} aria-label={sv ? "Antal" : "Quantity"} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3" />
      <input name="averageCost" required type="number" min="0" step="any" placeholder={sv ? "Pris per aktie" : "Price per share"} aria-label={sv ? "Pris per aktie" : "Price per share"} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3" />
      <input name="purchaseDate" required type="date" max={today} defaultValue={today} aria-label={sv ? "Inköpsdatum" : "Purchase date"} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3" />
      <div className="grid grid-cols-[1fr_1.2fr] gap-2">
        <input name="currency" required defaultValue="SEK" maxLength={3} pattern="[A-Za-z]{3}" aria-label={sv ? "Valuta" : "Currency"} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3 uppercase" />
        <input name="fees" type="number" min="0" step="any" defaultValue="0" aria-label={sv ? "Avgift" : "Fee"} placeholder={sv ? "Avgift" : "Fee"} className="h-11 rounded-md border border-white/12 bg-[#07111f] px-3" />
      </div>
      <Button type="submit" disabled={saving} className="min-h-11 sm:col-span-2 xl:col-span-3"><Plus className="h-4 w-4" aria-hidden="true" />{saving ? (sv ? "Lägger till…" : "Adding…") : (sv ? "Lägg till köp" : "Add purchase")}</Button>
      {selectedCompany ? <p className="text-xs text-[#8f9bac] sm:col-span-2 xl:col-span-3">{sv ? "Valt" : "Selected"}: <strong className="text-[#d6deea]">{selectedCompany.name}</strong></p> : null}
      {message ? <p className="text-xs text-[#c9d2df] sm:col-span-2 xl:col-span-3" role="status">{message}</p> : null}
    </form>
  );
}