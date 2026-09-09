import { describe, expect, it } from "vitest";
import type { CompanyFundamentals, CompanySearchResult, MarketSnapshot } from "../../src/lib/analysis/types";
import type { ComparisonFxContext } from "../../src/lib/data/ecb-fx";
import {
  assessDepositaryReceiptValuationAccess,
  gateDepositaryReceiptValuationInputs,
  type DepositaryReceiptRepresentation,
} from "../../src/lib/data/depositary-receipt";
import { buildDepositaryReceiptFxRequest } from "../../src/lib/data/depositary-receipt-fx";

type AdrCompany = CompanySearchResult & { depositaryReceipt?: DepositaryReceiptRepresentation };

function company(): AdrCompany {
  return {
    securityId: "adr:issuer-example:example",
    issuerId: "issuer-example",
    ticker: "EXAMPLE",
    canonicalTicker: "EXAMPLE",
    name: "Example ADR",
    securityType: "ADR",
    currency: "USD",
    depositaryReceipt: {
      kind: "ADR",
      issuerId: "issuer-example",
      receiptTicker: "EXAMPLE",
      primaryListingTicker: "EXAMPLE.CO",
      underlyingSharesPerReceipt: 0.5,
      issuerReportingCurrency: "DKK",
      primaryListingCurrency: "DKK",
      receiptTradingCurrency: "USD",
      ratioSource: "depositary disclosure",
      ratioAsOf: "2026-09-01",
      mappingVerified: true,
      ratioVerified: true,
      source: "issuer filing",
      sourceAsOf: "2026-09-01",
    },
  };
}

function fundamentals(overrides: Partial<CompanyFundamentals> = {}): CompanyFundamentals {
  return {
    ticker: "EXAMPLE",
    name: "Example A/S",
    entityId: "issuer-example",
    sector: "industrials",
    industry: "Industrial Products",
    annual: [],
    annualPeriods: [],
    reportingCurrency: "DKK",
    reportedSharesOutstanding: 2_000_000_000,
    reportedSharesDate: "2026-09-08",
    reportedMarketCap: 1_250_000_000_000,
    reportedMarketCapDate: "2026-09-08",
    reportedMarketCapCurrency: "DKK",
    ...overrides,
  };
}

function market(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    ticker: "EXAMPLE",
    price: 50,
    currency: "USD",
    date: "2026-09-08",
    volume: 1_000_000,
    yearHigh: 60,
    yearLow: 40,
    marketCap: 200_000_000_000,
    marketCapAsOf: "2026-09-08",
    marketCapCurrency: "USD",
    sharesOutstanding: 4_000_000_000,
    sharesOutstandingAsOf: "2026-09-08",
    priceHistory: [
      { date: "2026-09-01", close: 48 },
      { date: "2026-09-08", close: 50 },
    ],
    performance: { "1Y": 0.12, "3M": 0.03 },
    ...overrides,
  };
}

function usdToDkkContext(overrides: Partial<ComparisonFxContext> = {}): ComparisonFxContext {
  return {
    status: "normalized",
    sourceCurrency: "USD",
    targetCurrency: "DKK",
    rateDate: "2026-09-08",
    sourceRatePerEuro: 1.2,
    targetRatePerEuro: 7.5,
    provider: "ecb-euro-reference-rates",
    methodologyVersion: "ecb-fx-v1",
    ...overrides,
  };
}

describe("depositary-receipt cross-currency FX reconciliation", () => {
  it("builds an FX request only for a source-backed cross-currency ADR with verified ratio and market currency", () => {
    expect(buildDepositaryReceiptFxRequest(company(), market())).toEqual({
      id: "adr:issuer-example:example",
      currency: "USD",
      targetCurrency: "DKK",
      date: "2026-09-08",
    });
  });

  it("does not request FX for aligned, unverified, or market-currency-mismatched ADRs", () => {
    const aligned = company();
    aligned.depositaryReceipt = { ...aligned.depositaryReceipt!, receiptTradingCurrency: "DKK" };
    expect(buildDepositaryReceiptFxRequest(aligned, market({ currency: "DKK" }))).toBeNull();

    const unverified = company();
    unverified.depositaryReceipt = { ...unverified.depositaryReceipt!, ratioVerified: false };
    expect(buildDepositaryReceiptFxRequest(unverified, market())).toBeNull();

    expect(buildDepositaryReceiptFxRequest(company(), market({ currency: "EUR" }))).toBeNull();
  });

  it("allows cross-currency valuation only with a verified matching FX context", () => {
    const result = assessDepositaryReceiptValuationAccess(company(), usdToDkkContext());
    expect(result.allowed).toBe(true);
    expect(result.underlyingSharesPerReceipt).toBe(0.5);
  });

  it("rejects FX contexts whose source or target currency does not match the verified representation", () => {
    expect(assessDepositaryReceiptValuationAccess(company(), usdToDkkContext({ sourceCurrency: "EUR" })).allowed).toBe(false);
    expect(assessDepositaryReceiptValuationAccess(company(), usdToDkkContext({ targetCurrency: "SEK" })).allowed).toBe(false);
  });

  it("rejects a market quote whose currency disagrees with the verified receipt currency", () => {
    const gated = gateDepositaryReceiptValuationInputs(
      company(),
      market({ currency: "EUR" }),
      fundamentals(),
      usdToDkkContext(),
    );
    expect(gated.market?.marketCap).toBeNull();
    expect(gated.warning).toMatch(/receipt.*currency|market.*currency/i);
  });

  it("converts a consistent current receipt quote and market cap to primary-listing currency", () => {
    const gated = gateDepositaryReceiptValuationInputs(company(), market(), fundamentals(), usdToDkkContext());

    // 50 USD -> 312.5 DKK, then 0.5 underlying shares per receipt => 625 DKK per underlying share.
    // 625 DKK * 2bn verified issuer shares = 1.25tn DKK market cap.
    expect(gated.market?.price).toBeCloseTo(625, 10);
    expect(gated.market?.currency).toBe("DKK");
    expect(gated.market?.marketCap).toBeCloseTo(1_250_000_000_000, 2);
    expect(gated.market?.marketCapCurrency).toBe("DKK");
    expect(gated.market?.sharesOutstanding).toBe(2_000_000_000);
    expect(gated.market?.performance["1Y"]).toBe(0.12);
    expect(gated.warning).toBeNull();
  });

  it("rejects contradictory converted and reported market caps instead of overriding verified price-times-shares", () => {
    const gated = gateDepositaryReceiptValuationInputs(
      company(),
      market({ marketCap: 32_000_000_000 }),
      fundamentals({ reportedMarketCap: 200_000_000_000 }),
      usdToDkkContext(),
    );

    expect(gated.market?.price).toBeCloseTo(625, 10);
    expect(gated.market?.sharesOutstanding).toBe(2_000_000_000);
    expect(gated.market?.marketCap).toBeNull();
    expect(gated.market?.marketCapCurrency).toBeNull();
    expect(gated.warning).toMatch(/market cap|share basis/i);
  });

  it("does not apply one spot FX rate to historical price series or historical ranges", () => {
    const gated = gateDepositaryReceiptValuationInputs(company(), market(), fundamentals(), usdToDkkContext());
    expect(gated.market?.priceHistory).toBeUndefined();
    expect(gated.market?.yearHigh).toBeNull();
    expect(gated.market?.yearLow).toBeNull();
  });
});
