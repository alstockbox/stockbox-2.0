export type DepositaryReceiptRepresentation = {
  issuerId: string;
  receiptTicker: string;
  primaryListingTicker: string;
  underlyingSharesPerReceipt: number | null;
  issuerReportingCurrency: string | null;
  primaryListingCurrency: string | null;
  receiptTradingCurrency: string | null;
  ratioSource: string | null;
  ratioAsOf: string | null;
};

export type DepositaryReceiptShareBasisResult = {
  verified: boolean;
  underlyingSharesPerReceipt: number | null;
  reason: string;
};

function positiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizedCurrency(value: string | null | undefined): string | null {
  const currency = value?.trim().toUpperCase();
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
}

export function verifyDepositaryReceiptShareBasis(
  representation: DepositaryReceiptRepresentation,
): DepositaryReceiptShareBasisResult {
  if (!representation.issuerId.trim()) {
    return { verified: false, underlyingSharesPerReceipt: null, reason: "Depositary-receipt issuer identity is unresolved." };
  }

  if (!representation.primaryListingTicker.trim()) {
    return { verified: false, underlyingSharesPerReceipt: null, reason: "Depositary-receipt primary listing is unresolved." };
  }

  if (!positiveFinite(representation.underlyingSharesPerReceipt)) {
    return { verified: false, underlyingSharesPerReceipt: null, reason: "A verified positive underlying-shares-per-receipt ratio is required." };
  }

  if (!representation.ratioSource?.trim() || !representation.ratioAsOf?.trim()) {
    return { verified: false, underlyingSharesPerReceipt: null, reason: "Depositary-receipt ratio provenance is incomplete." };
  }

  return {
    verified: true,
    underlyingSharesPerReceipt: representation.underlyingSharesPerReceipt,
    reason: "Issuer identity, primary listing and depositary-receipt share ratio are verified.",
  };
}

export function normalizeUnderlyingPerShareToReceipt(
  underlyingPerShareValue: number | null | undefined,
  representation: DepositaryReceiptRepresentation,
): number | null {
  const basis = verifyDepositaryReceiptShareBasis(representation);
  if (!basis.verified || !positiveFinite(basis.underlyingSharesPerReceipt)) return null;
  if (typeof underlyingPerShareValue !== "number" || !Number.isFinite(underlyingPerShareValue)) return null;
  return underlyingPerShareValue * basis.underlyingSharesPerReceipt;
}

export function normalizeReceiptSharesToUnderlyingShares(
  receiptShares: number | null | undefined,
  representation: DepositaryReceiptRepresentation,
): number | null {
  const basis = verifyDepositaryReceiptShareBasis(representation);
  if (!basis.verified || !positiveFinite(basis.underlyingSharesPerReceipt)) return null;
  if (typeof receiptShares !== "number" || !Number.isFinite(receiptShares) || receiptShares < 0) return null;
  return receiptShares * basis.underlyingSharesPerReceipt;
}

export function depositaryReceiptCurrencyState(
  representation: DepositaryReceiptRepresentation,
): "aligned" | "fx_required" | "unknown" {
  const primary = normalizedCurrency(representation.primaryListingCurrency);
  const receipt = normalizedCurrency(representation.receiptTradingCurrency);
  if (!primary || !receipt) return "unknown";
  return primary === receipt ? "aligned" : "fx_required";
}

export function canUseDepositaryReceiptPerShareValuation(
  representation: DepositaryReceiptRepresentation,
  hasVerifiedFxConversion: boolean,
): boolean {
  if (!verifyDepositaryReceiptShareBasis(representation).verified) return false;
  const currencyState = depositaryReceiptCurrencyState(representation);
  if (currencyState === "unknown") return false;
  if (currencyState === "fx_required" && !hasVerifiedFxConversion) return false;
  return true;
}
