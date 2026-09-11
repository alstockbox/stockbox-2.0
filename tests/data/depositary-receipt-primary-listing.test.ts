import { describe, expect, it } from "vitest";
import type { CompanySearchResult, MarketSnapshot } from "../../src/lib/analysis/types";
import type { ComparisonFxContext } from "../../src/lib/data/ecb-fx";
import type { DepositaryReceiptRepresentation } from "../../src/lib/data/depositary-receipt";
import {
  buildDepositaryReceiptPrimaryListingCompany,
  depositaryReceiptPrimaryListingSourceConflict,
  reconcileDepositaryReceiptPrimaryListingPrice,
} from "../../src/lib/data/depositary-receipt-primary-listing";

type AdrCompany = CompanySearchResult & { depositaryReceipt?: DepositaryReceiptRepresentation };

function adr(overrides: Partial<DepositaryReceiptRepresentation> = {}): AdrCompany {
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
      ...overrides,
    },
  };
}

function fx(): ComparisonFxContext {
  return {
    status: "normalized",
    sourceCurrency: "USD",
    targetCurrency: "DKK",
    rateDate: "2026-09-08",
    sourceRatePerEuro: 1.2,
    targetRatePerEuro: 7.5,
    provider: "ecb-euro-reference-rates",
    methodologyVersion: "ecb-fx-v1",
  };
}

function market(price: number, currency: string, date = "2026-09-08", provider = "test-market"): MarketSnapshot {
  return {
    ticker: "EXAMPLE",
    price,
    currency,
    date,
    volume: 1_000_000,
    yearHigh: null,
    yearLow: null,
    performance: {},
    provider,
  };
}

describe("depositary-receipt primary-listing reconciliation", () => {
  it("builds a market-data-only primary-listing request from the verified source-backed mapping", () => {
    expect(buildDepositaryReceiptPrimaryListingCompany(adr(), fx())).toEqual(expect.objectContaining({
      ticker: "EXAMPLE.CO",
      canonicalTicker: "EXAMPLE.CO",
      issuerId: "issuer-example",
      securityType: "Common Stock",
      currency: "DKK",
      source: "issuer filing",
      sourceUpdatedAt: "2026-09-01",
      providerCapabilities: {
        fundamentals: false,
        marketData: true,
        providerIds: [],
      },
    }));
  });

  it("does not create a primary-listing request when ADR valuation access is not verified", () => {
    expect(buildDepositaryReceiptPrimaryListingCompany(adr({ ratioVerified: false }), fx())).toBeNull();
    expect(buildDepositaryReceiptPrimaryListingCompany(adr(), undefined)).toBeNull();
  });

  it("accepts same-date primary price when it matches the normalized underlying ADR price within 5%", () => {
    const result = reconcileDepositaryReceiptPrimaryListingPrice(
      adr(),
      market(625, "DKK"),
      market(620, "DKK"),
    );

    expect(result.status).toBe("aligned");
    expect(result.relativeDifference).toBeLessThan(0.05);
    expect(depositaryReceiptPrimaryListingSourceConflict(market(625, "DKK"), market(620, "DKK"), result)).toBeNull();
  });

  it("normalizes quote units such as GBp before comparing with primary-listing economic currency", () => {
    const gbpAdr = adr({
      receiptTradingCurrency: "GBP",
      primaryListingCurrency: "GBP",
      primaryListingTicker: "EXAMPLE.L",
      underlyingSharesPerReceipt: 1,
    });
    const result = reconcileDepositaryReceiptPrimaryListingPrice(
      gbpAdr,
      market(10, "GBP"),
      market(1_000, "GBp"),
    );

    expect(result.status).toBe("aligned");
    expect(result.relativeDifference).toBe(0);
  });

  it("flags a material same-date primary-listing disagreement above 5%", () => {
    const normalizedAdr = market(625, "DKK", "2026-09-08", "adr-normalized-market");
    const primary = market(500, "DKK", "2026-09-08", "primary-listing-market");
    const result = reconcileDepositaryReceiptPrimaryListingPrice(adr(), normalizedAdr, primary);

    expect(result.status).toBe("conflict");
    expect(result.relativeDifference).toBeGreaterThan(0.05);
    expect(result.reason).toMatch(/primary listing|conflict|difference/i);
    expect(depositaryReceiptPrimaryListingSourceConflict(normalizedAdr, primary, result)).toEqual({
      metric: "marketPrice",
      periodEnd: "2026-09-08",
      primaryProvider: "adr-normalized-market",
      secondaryProvider: "primary-listing-market",
      primaryValue: 625,
      secondaryValue: 500,
      relativeDifference: 0.2,
      severity: "high",
      kind: "share_basis_mismatch",
      resolved: false,
      reason: result.reason,
    });
  });

  it("returns unavailable instead of fabricating a comparison across different quote dates or currencies", () => {
    const differentDate = reconcileDepositaryReceiptPrimaryListingPrice(
      adr(),
      market(625, "DKK", "2026-09-08"),
      market(620, "DKK", "2026-09-07"),
    );
    expect(differentDate.status).toBe("unavailable");
    expect(depositaryReceiptPrimaryListingSourceConflict(
      market(625, "DKK", "2026-09-08"),
      market(620, "DKK", "2026-09-07"),
      differentDate,
    )).toBeNull();

    const differentCurrency = reconcileDepositaryReceiptPrimaryListingPrice(
      adr(),
      market(625, "DKK"),
      market(620, "SEK"),
    );
    expect(differentCurrency.status).toBe("unavailable");
    expect(depositaryReceiptPrimaryListingSourceConflict(
      market(625, "DKK"),
      market(620, "SEK"),
      differentCurrency,
    )).toBeNull();
  });
});
