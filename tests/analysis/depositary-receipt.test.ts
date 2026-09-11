import { describe, expect, it } from "vitest";
import {
  canUseDepositaryReceiptPerShareValuation,
  depositaryReceiptCurrencyState,
  normalizeReceiptSharesToUnderlyingShares,
  normalizeUnderlyingPerShareToReceipt,
  verifyDepositaryReceiptShareBasis,
  type DepositaryReceiptRepresentation,
} from "../../src/lib/analysis/depositary-receipt";

function representation(overrides: Partial<DepositaryReceiptRepresentation> = {}): DepositaryReceiptRepresentation {
  return {
    issuerId: "issuer:novo-nordisk",
    receiptTicker: "NVO",
    primaryListingTicker: "NOVO-B.CO",
    underlyingSharesPerReceipt: 1,
    issuerReportingCurrency: "DKK",
    primaryListingCurrency: "DKK",
    receiptTradingCurrency: "USD",
    ratioSource: "issuer/depositary disclosure",
    ratioAsOf: "2026-09-08",
    ...overrides,
  };
}

describe("depositary receipt share-basis normalization", () => {
  it("fails closed when the ADS ratio is missing", () => {
    const result = verifyDepositaryReceiptShareBasis(representation({ underlyingSharesPerReceipt: null }));
    expect(result.verified).toBe(false);
    expect(result.underlyingSharesPerReceipt).toBeNull();
    expect(normalizeUnderlyingPerShareToReceipt(42, representation({ underlyingSharesPerReceipt: null }))).toBeNull();
  });

  it("fails closed when ratio provenance is missing", () => {
    expect(verifyDepositaryReceiptShareBasis(representation({ ratioSource: null })).verified).toBe(false);
    expect(verifyDepositaryReceiptShareBasis(representation({ ratioAsOf: null })).verified).toBe(false);
  });

  it("normalizes underlying per-share values to the receipt share basis", () => {
    const rep = representation({ underlyingSharesPerReceipt: 2 });
    expect(normalizeUnderlyingPerShareToReceipt(12.5, rep)).toBe(25);
    expect(normalizeReceiptSharesToUnderlyingShares(100, rep)).toBe(200);
  });

  it("requires verified FX conversion when listing and receipt currencies differ", () => {
    const rep = representation();
    expect(depositaryReceiptCurrencyState(rep)).toBe("fx_required");
    expect(canUseDepositaryReceiptPerShareValuation(rep, false)).toBe(false);
    expect(canUseDepositaryReceiptPerShareValuation(rep, true)).toBe(true);
  });

  it("allows same-currency per-share valuation without an FX conversion", () => {
    const rep = representation({ receiptTradingCurrency: "DKK" });
    expect(depositaryReceiptCurrencyState(rep)).toBe("aligned");
    expect(canUseDepositaryReceiptPerShareValuation(rep, false)).toBe(true);
  });

  it("withholds valuation when currency identity is unresolved", () => {
    const rep = representation({ receiptTradingCurrency: null });
    expect(depositaryReceiptCurrencyState(rep)).toBe("unknown");
    expect(canUseDepositaryReceiptPerShareValuation(rep, true)).toBe(false);
  });

  it("rejects invalid ratios instead of coercing them", () => {
    expect(verifyDepositaryReceiptShareBasis(representation({ underlyingSharesPerReceipt: 0 })).verified).toBe(false);
    expect(verifyDepositaryReceiptShareBasis(representation({ underlyingSharesPerReceipt: -1 })).verified).toBe(false);
    expect(verifyDepositaryReceiptShareBasis(representation({ underlyingSharesPerReceipt: Number.NaN })).verified).toBe(false);
  });
});
