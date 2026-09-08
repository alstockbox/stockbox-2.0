import { describe, expect, it } from "vitest";
import {
  assessDepositaryReceiptFundamentalsAccess,
  assessDepositaryReceiptValuationAccess,
  gateDepositaryReceiptValuationInputs,
  type DepositaryReceiptRepresentation,
} from "../../src/lib/data/depositary-receipt";
import type { CompanyFundamentals, CompanySearchResult, MarketSnapshot } from "../../src/lib/analysis/types";

type AdrCompany = CompanySearchResult & { depositaryReceipt?: DepositaryReceiptRepresentation };

function adr(overrides: Partial<AdrCompany> = {}): AdrCompany {
  return {
    ticker: "NVO",
    canonicalTicker: "NVO",
    name: "Novo Nordisk A/S ADR",
    securityType: "ADR",
    issuerId: "issuer-novo",
    currency: "USD",
    ...overrides,
  };
}

function mappedAdr(overrides: Partial<DepositaryReceiptRepresentation> = {}): AdrCompany {
  return adr({
    depositaryReceipt: {
      kind: "ADR",
      issuerId: "issuer-novo",
      primaryListingTicker: "NOVO-B.CO",
      mappingVerified: true,
      ratioVerified: false,
      source: "issuer filing",
      ...overrides,
    },
  });
}

function market(): MarketSnapshot {
  return {
    ticker: "NVO",
    price: 50,
    currency: "USD",
    date: "2026-09-08",
    volume: 1_000_000,
    yearHigh: 70,
    yearLow: 40,
    marketCap: 200_000_000_000,
    marketCapAsOf: "2026-09-08",
    marketCapCurrency: "USD",
    sharesOutstanding: 4_000_000_000,
    sharesOutstandingAsOf: "2026-09-08",
    performance: { "1Y": 0.1, "3M": 0.02 },
  };
}

function fundamentals(): CompanyFundamentals {
  return {
    ticker: "NVO",
    name: "Novo Nordisk A/S",
    entityId: "issuer-novo",
    sector: "healthcare",
    industry: "Drug Manufacturers",
    annual: [],
    annualPeriods: [],
    reportedMarketCap: 200_000_000_000,
    reportedMarketCapDate: "2026-09-08",
    reportedMarketCapCurrency: "USD",
    reportedSharesOutstanding: 4_000_000_000,
    reportedSharesDate: "2026-09-08",
    reportedValuation: {
      provider: "provider",
      asOfDate: "2026-09-08",
      priceEarnings: 25,
      priceSales: 10,
      priceBook: 18,
      marketCap: 200_000_000_000,
      marketCapCurrency: "USD",
    },
  };
}

describe("depositary receipt reconciliation", () => {
  it("fails closed when ADR issuer mapping is missing", () => {
    const result = assessDepositaryReceiptFundamentalsAccess(adr());
    expect(result.allowed).toBe(false);
    expect(result.scope).toBe("none");
    expect(result.reason).toMatch(/mapping|primary listing|issuer/i);
  });

  it("allows issuer-level fundamentals only after verified issuer and primary-listing mapping", () => {
    const result = assessDepositaryReceiptFundamentalsAccess(mappedAdr());
    expect(result.allowed).toBe(true);
    expect(result.scope).toBe("issuer_fundamentals_only");
  });

  it("keeps valuation unavailable until the ADR ratio is verified", () => {
    const result = assessDepositaryReceiptValuationAccess(mappedAdr());
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/ratio|share basis/i);
  });

  it("allows valuation only with a positive verified underlying-shares-per-receipt ratio", () => {
    const result = assessDepositaryReceiptValuationAccess(mappedAdr({
      underlyingSharesPerReceipt: 0.5,
      ratioVerified: true,
    }));

    expect(result.allowed).toBe(true);
    expect(result.underlyingSharesPerReceipt).toBe(0.5);
  });

  it("rejects a mismatched issuer id even when mapping is marked verified", () => {
    const result = assessDepositaryReceiptFundamentalsAccess(mappedAdr({
      issuerId: "different-issuer",
      ratioVerified: true,
      underlyingSharesPerReceipt: 0.5,
    }));

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/issuer/i);
  });

  it("preserves price and momentum but strips all representation-sensitive valuation inputs when ratio is unresolved", () => {
    const gated = gateDepositaryReceiptValuationInputs(mappedAdr(), market(), fundamentals());

    expect(gated.market?.price).toBe(50);
    expect(gated.market?.performance["1Y"]).toBe(0.1);
    expect(gated.market?.marketCap).toBeNull();
    expect(gated.market?.sharesOutstanding).toBeNull();
    expect(gated.fundamentals.reportedMarketCap).toBeNull();
    expect(gated.fundamentals.reportedSharesOutstanding).toBeNull();
    expect(gated.fundamentals.reportedValuation).toBeUndefined();
    expect(gated.warning).toMatch(/valuation|share ratio/i);
  });

  it("preserves valuation inputs when the mapping and ratio are both verified", () => {
    const gated = gateDepositaryReceiptValuationInputs(mappedAdr({
      underlyingSharesPerReceipt: 0.5,
      ratioVerified: true,
    }), market(), fundamentals());

    expect(gated.market?.marketCap).toBe(200_000_000_000);
    expect(gated.market?.sharesOutstanding).toBe(4_000_000_000);
    expect(gated.fundamentals.reportedValuation?.priceEarnings).toBe(25);
    expect(gated.warning).toBeNull();
  });
});
