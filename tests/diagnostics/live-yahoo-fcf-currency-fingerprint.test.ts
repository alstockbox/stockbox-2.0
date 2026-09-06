import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { searchCompanies } from "../../src/lib/data/provider";
import { fetchYahooFundamentalsResult } from "../../src/lib/data/yahoo-fundamentals";
import { yahooMarketDataProvider } from "../../src/lib/data/yahoo-market";
import {
  convertWithEcbRates,
  fetchEcbReferenceRateHistory,
  selectEcbRatesAtOrBefore,
} from "../../src/lib/data/ecb-fx";

const liveDescribe = process.env.RUN_LIVE_COVERAGE === "1" ? describe : describe.skip;

const FCF_VALUATION_FINGERPRINT_TICKERS = [
  "SIP.BR", "EMBLA.CO", "0352.HK", "AP4.SI", "ORA.TA", "PXT.TO", "BHP.AX", "BESTE.IS",
] as const;

liveDescribe("live Yahoo FCF-yield valuation fingerprint", () => {
  it("traces provider market-cap, FCF, financial-period and ECB currency bases", async () => {
    const ecbHistory = await fetchEcbReferenceRateHistory();
    const rows: Array<Record<string, unknown>> = [];

    for (const ticker of FCF_VALUATION_FINGERPRINT_TICKERS) {
      const candidates = await searchCompanies(ticker);
      const company = candidates.find((candidate) =>
        (candidate.canonicalTicker ?? candidate.ticker).toUpperCase() === ticker
      );
      expect(company, `Expected exact candidate for ${ticker}`).toBeTruthy();
      if (!company) continue;

      const [fundamentals, market] = await Promise.all([
        fetchYahooFundamentalsResult(company),
        yahooMarketDataProvider.fetchMarketData(company),
      ]);
      expect(fundamentals.ok, `Expected Yahoo fundamentals for ${ticker}`).toBe(true);
      expect(market.ok, `Expected Yahoo market data for ${ticker}`).toBe(true);
      if (!fundamentals.ok || !market.ok) continue;

      const reported = fundamentals.data.reportedValuation;
      const marketCap = reported?.marketCap ?? fundamentals.data.reportedMarketCap ?? null;
      const marketCapCurrency = reported?.marketCapCurrency ?? fundamentals.data.reportedMarketCapCurrency ?? null;
      const marketCapDate = reported?.asOfDate ?? fundamentals.data.reportedMarketCapDate ?? market.data.date ?? null;
      const freeCashFlow = reported?.freeCashFlow ?? null;
      const freeCashFlowCurrency = reported?.freeCashFlowCurrency ?? null;
      const freeCashFlowDate = reported?.freeCashFlowDate ?? null;
      const latestAnnual = fundamentals.data.annualPeriods?.at(-1) ?? null;
      const latestPeriod = fundamentals.data.trailingTwelveMonths ?? latestAnnual;
      const latestAnnualFcfProvenance = latestAnnual?.provenance?.freeCashFlow ?? null;
      const ecbObservation = marketCapDate ? selectEcbRatesAtOrBefore(ecbHistory, marketCapDate) : null;
      const convertedFcfToMarketCurrency = (
        ecbObservation
        && typeof freeCashFlow === "number"
        && Number.isFinite(freeCashFlow)
        && freeCashFlowCurrency
        && marketCapCurrency
      ) ? convertWithEcbRates(freeCashFlow, freeCashFlowCurrency, marketCapCurrency, ecbObservation) : null;
      const convertedMarketCapToFcfCurrency = (
        ecbObservation
        && typeof marketCap === "number"
        && Number.isFinite(marketCap)
        && freeCashFlowCurrency
        && marketCapCurrency
      ) ? convertWithEcbRates(marketCap, marketCapCurrency, freeCashFlowCurrency, ecbObservation) : null;

      rows.push({
        ticker,
        resolvedTicker: company.canonicalTicker ?? company.ticker,
        companyCurrency: company.currency ?? null,
        market: {
          currency: market.data.currency ?? null,
          price: market.data.price ?? null,
          priceDate: market.data.date ?? null,
          marketCap: market.data.marketCap ?? null,
          marketCapCurrency: market.data.marketCapCurrency ?? null,
          marketCapAsOf: market.data.marketCapAsOf ?? null,
          sharesOutstanding: market.data.sharesOutstanding ?? null,
        },
        fundamentals: {
          hasTrailingTwelveMonths: Boolean(fundamentals.data.trailingTwelveMonths),
          financialFlowPeriodBasis: fundamentals.data.diagnostics?.financialFlowPeriodBasis ?? null,
          financialFlowPeriodEnd: fundamentals.data.diagnostics?.financialFlowPeriodEnd ?? null,
          annualPeriodCount: fundamentals.data.annualPeriods?.length ?? 0,
          selectedPeriodCurrency: latestPeriod?.currency ?? null,
          selectedPeriodEnd: latestPeriod?.periodEndDate ?? null,
          latestAnnualPeriodEnd: latestAnnual?.periodEndDate ?? null,
          latestAnnualFreeCashFlow: latestAnnual?.freeCashFlow ?? null,
          latestAnnualFreeCashFlowCurrency: latestAnnual?.currency ?? null,
          latestAnnualFreeCashFlowProvenance: latestAnnualFcfProvenance,
          reportedMarketCap: marketCap,
          reportedMarketCapCurrency: marketCapCurrency,
          reportedMarketCapDate: marketCapDate,
          reportedFreeCashFlow: freeCashFlow,
          reportedFreeCashFlowCurrency: freeCashFlowCurrency,
          reportedFreeCashFlowDate: freeCashFlowDate,
        },
        ecb: {
          observationDate: ecbObservation?.date ?? null,
          marketCurrencySupported: marketCapCurrency ? ecbObservation?.ratesPerEuro[marketCapCurrency] ?? null : null,
          fcfCurrencySupported: freeCashFlowCurrency ? ecbObservation?.ratesPerEuro[freeCashFlowCurrency] ?? null : null,
          convertedFcfToMarketCurrency,
          convertedMarketCapToFcfCurrency,
          derivedFcfYield: typeof convertedFcfToMarketCurrency === "number"
            && Number.isFinite(convertedFcfToMarketCurrency)
            && typeof marketCap === "number"
            && Number.isFinite(marketCap)
            && marketCap > 0
              ? convertedFcfToMarketCurrency / marketCap
              : null,
        },
      });
    }

    console.log(`YAHOO_FCF_VALUATION_FINGERPRINT ${JSON.stringify(rows)}`);
    await mkdir("artifacts/coverage-live", { recursive: true });
    await writeFile(
      "artifacts/coverage-live/yahoo-fcf-currency-fingerprint.json",
      `${JSON.stringify(rows, null, 2)}\n`,
      "utf8",
    );
    expect(rows).toHaveLength(FCF_VALUATION_FINGERPRINT_TICKERS.length);
  }, 240_000);
});
