import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HistoricalChartExplorer } from "../../src/components/analysis/historical-chart-explorer";
import type { HistoricalResearchData, MarketPricePoint } from "../../src/lib/analysis/types";

type CurrencyPricePoint = MarketPricePoint & { currency?: string | null };

function historicalWithPrice(currency?: string | null, current = 417.2, prior = 152.3): HistoricalResearchData {
  return {
    financials: [],
    price: [
      { date: "2021-08-31", close: prior, currency } as CurrencyPricePoint,
      { date: "2026-08-31", close: current, currency } as CurrencyPricePoint,
    ],
    revenueCagr3y: null,
    revenueCagr5y: null,
    revenueCagr10y: null,
    epsCagr3y: null,
    epsCagr5y: null,
    epsCagr10y: null,
    dividendCagr3y: null,
    dividendCagr5y: null,
    dividendCagr10y: null,
    dividendYearsIncreased: 0,
    dividendYearsUnchanged: 0,
    dividendYearsCut: 0,
  };
}

function formatted(value: number, currency: string, locale: "sv-SE" | "en-US") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

describe("historical chart price currency P0", () => {
  it.each([
    ["SEK", "sv" as const, "sv-SE" as const],
    ["EUR", "en" as const, "en-US" as const],
    ["JPY", "en" as const, "en-US" as const],
  ])("renders price history in the provider trading currency %s", (currency, locale, numberLocale) => {
    const markup = renderToStaticMarkup(createElement(HistoricalChartExplorer, {
      historical: historicalWithPrice(currency),
      locale,
    }));

    expect(markup).toContain(formatted(417.2, currency, numberLocale));
    if (currency !== "USD") expect(markup).not.toContain(formatted(417.2, "USD", numberLocale));
  });

  it("converts London pence quote units to economic GBP before formatting", () => {
    const markup = renderToStaticMarkup(createElement(HistoricalChartExplorer, {
      historical: historicalWithPrice("GBp", 2500, 1800),
      locale: "en",
    }));

    expect(markup).toContain(formatted(25, "GBP", "en-US"));
    expect(markup).not.toContain(formatted(2500, "GBP", "en-US"));
  });

  it("never invents USD when historical price currency is unknown", () => {
    const markup = renderToStaticMarkup(createElement(HistoricalChartExplorer, {
      historical: historicalWithPrice(null),
      locale: "sv",
    }));

    expect(markup).not.toContain(formatted(417.2, "USD", "sv-SE"));
    expect(markup).toContain(new Intl.NumberFormat("sv-SE", { notation: "compact", maximumFractionDigits: 1 }).format(417.2));
  });
});