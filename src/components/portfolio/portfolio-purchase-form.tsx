"use client";

import { CheckCircle2, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CompanySearchResult } from "@/lib/analysis/types";
import { Button } from "@/components/ui/button";

type PortfolioOption = {
  id: string;
  name: string;
  baseCurrency: string;
};

type Props = {
  portfolios: PortfolioOption[];
  locale: "sv" | "en";
  today: string;
  action: (formData: FormData) => void | Promise<void>;
};

function displayTicker(company: CompanySearchResult) {
  return company.canonicalTicker ?? company.ticker;
}

export function PortfolioPurchaseForm({ portfolios, locale, today, action }: Props) {
  const sv = locale === "sv";
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState<CompanySearchResult[]>([]);
  const [selected, setSelected] = useState<CompanySearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [currency, setCurrency] = useState("SEK");
  const requestId = useRef(0);

  useEffect(() => {
    const value = query.trim();
    if (selected && value === `${displayTicker(selected)} — ${selected.name}`) return;
    if (value.length < 2) return;

    const current = ++requestId.current;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/companies/search?q=${encodeURIComponent(value)}`, { signal: controller.signal });
        const payload = await response.json() as { companies?: CompanySearchResult[] };
        if (response.ok && current === requestId.current) setCompanies(payload.companies ?? []);
      } catch (caught) {
        if (!(caught instanceof Error && caught.name === "AbortError") && current === requestId.current) setCompanies([]);
      } finally {
        if (current === requestId.current) setSearching(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, selected]);

  function handleQueryChange(value: string) {
    setQuery(value);
    setSelected(null);
    if (value.trim().length < 2) {
      requestId.current += 1;
      setCompanies([]);
      setSearching(false);
    }
  }

  function choose(company: CompanySearchResult) {
    setSelected(company);
    setQuery(`${displayTicker(company)} — ${company.name}`);
    setCompanies([]);
    const companyCurrency = company.currency?.trim().toUpperCase();
    if (companyCurrency && /^[A-Z]{3}$/.test(companyCurrency)) setCurrency(companyCurrency);
  }

  return (
    <form action={action} className="mt-4 grid gap-3">
      <input type="hidden" name="ticker" value={selected ? displayTicker(selected) : ""} />
      <input type="hidden" name="companyName" value={selected?.name ?? ""} />

      <div className="grid gap-2 sm:grid-cols-[minmax(0,.8fr)_minmax(0,1.4fr)]">
        <div>
          <label htmlFor="purchase-portfolio" className="mb-1.5 block text-xs font-medium text-[#9aa7b8]">
            {sv ? "Portfölj" : "Portfolio"}
          </label>
          <select id="purchase-portfolio" name="portfolioId" required className="h-12 w-full rounded-lg border border-white/12 bg-[#07111f] px-3">
            {portfolios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>

        <div className="relative">
          <label htmlFor="portfolio-company-search" className="mb-1.5 block text-xs font-medium text-[#9aa7b8]">
            {sv ? "Sök bolag" : "Search company"}
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7f8b9b]" aria-hidden="true" />
            <input
              id="portfolio-company-search"
              role="combobox"
              value={query}
              onChange={(event) => handleQueryChange(event.target.value)}
              autoComplete="off"
              placeholder={sv ? "Sök t.ex. Investor, Volvo, Apple eller AAPL" : "Search e.g. Investor, Volvo, Apple or AAPL"}
              aria-autocomplete="list"
              aria-controls="portfolio-company-search-results"
              aria-expanded={companies.length > 0}
              aria-haspopup="listbox"
              className="h-12 w-full rounded-lg border border-white/15 bg-[#07111f] pl-10 pr-3 text-sm text-[#f4efe5] outline-none ring-[#e1cb95]/50 placeholder:text-[#6f7b8c] focus:ring-2"
            />
          </div>

          {searching ? <p className="mt-1.5 text-xs text-[#9aa7b8]">{sv ? "Söker bolag…" : "Searching companies…"}</p> : null}

          {companies.length ? (
            <div id="portfolio-company-search-results" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-white/12 bg-[#07111f] p-1 shadow-2xl shadow-black/40" role="listbox">
              {companies.slice(0, 7).map((company) => (
                <button
                  key={`${company.securityId ?? ""}-${displayTicker(company)}-${company.exchange ?? ""}`}
                  type="button"
                  onClick={() => choose(company)}
                  className="flex min-h-12 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-white/8 focus:bg-white/8 focus:outline-none"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-[#f4efe5]">{company.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-[#9aa7b8]">
                      {displayTicker(company)}{company.exchange ? ` · ${company.exchange}` : ""}{company.country ? ` · ${company.country}` : ""}
                    </span>
                  </span>
                  {company.currency ? <span className="shrink-0 text-xs text-[#e1cb95]">{company.currency}</span> : null}
                </button>
              ))}
            </div>
          ) : null}

          {selected ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              {sv ? "Valt" : "Selected"}: {selected.name} ({displayTicker(selected)})
            </p>
          ) : query.trim().length >= 2 && !searching && !companies.length ? (
            <p className="mt-1.5 text-xs text-[#7f8b9b]">{sv ? "Välj ett bolag från sökresultaten innan köpet läggs till." : "Select a company from the search results before adding the purchase."}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <div>
          <label htmlFor="purchase-quantity" className="mb-1.5 block text-xs font-medium text-[#9aa7b8]">{sv ? "Antal" : "Quantity"}</label>
          <input id="purchase-quantity" name="quantity" required type="number" min="0.000001" step="any" placeholder={sv ? "Antal" : "Quantity"} className="h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3" />
        </div>
        <div>
          <label htmlFor="purchase-price" className="mb-1.5 block text-xs font-medium text-[#9aa7b8]">{sv ? "Pris per aktie" : "Price per share"}</label>
          <input id="purchase-price" name="averageCost" required type="number" min="0" step="any" placeholder="0" className="h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3" />
        </div>
        <div>
          <label htmlFor="purchase-date" className="mb-1.5 block text-xs font-medium text-[#9aa7b8]">{sv ? "Inköpsdatum" : "Purchase date"}</label>
          <input id="purchase-date" name="purchaseDate" required type="date" max={today} defaultValue={today} className="h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3" />
        </div>
        <div>
          <label htmlFor="purchase-currency" className="mb-1.5 block text-xs font-medium text-[#9aa7b8]">{sv ? "Valuta" : "Currency"}</label>
          <input id="purchase-currency" name="currency" required value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} pattern="[A-Za-z]{3}" className="h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3 uppercase" />
        </div>
        <div>
          <label htmlFor="purchase-fee" className="mb-1.5 block text-xs font-medium text-[#9aa7b8]">{sv ? "Avgift" : "Fee"}</label>
          <input id="purchase-fee" name="fees" type="number" min="0" step="any" defaultValue="0" placeholder="0" className="h-11 w-full rounded-md border border-white/12 bg-[#07111f] px-3" />
        </div>
      </div>

      <Button disabled={!selected} className="min-h-12 w-full text-base">
        <Plus className="h-4 w-4" aria-hidden="true" />
        {selected ? (sv ? `Lägg till ${displayTicker(selected)}` : `Add ${displayTicker(selected)}`) : (sv ? "Välj ett bolag först" : "Select a company first")}
      </Button>
    </form>
  );
}
