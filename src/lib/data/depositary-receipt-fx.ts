import {
  depositaryReceiptCurrencyState,
  verifyDepositaryReceiptShareBasis,
} from "@/lib/analysis/depositary-receipt";
import type { CompanySearchResult, MarketSnapshot } from "@/lib/analysis/types";
import type { DepositaryReceiptCompany } from "./depositary-receipt";

export type DepositaryReceiptFxRequest = {
  id: string;
  currency: string;
  targetCurrency: string;
  date: string;
};

function normalizedCurrency(value: string | null | undefined): string | null {
  const currency = value?.trim().toUpperCase();
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
}

export function buildDepositaryReceiptFxRequest(
  company: CompanySearchResult,
  market: MarketSnapshot | null,
): DepositaryReceiptFxRequest | null {
  if (company.securityType !== "ADR" || !company.securityId?.trim() || !market?.date?.trim()) return null;

  const representation = (company as DepositaryReceiptCompany).depositaryReceipt;
  if (!representation?.mappingVerified || !representation.ratioVerified) return null;
  if (!company.issuerId?.trim() || company.issuerId.trim() !== representation.issuerId.trim()) return null;
  if (!representation.primaryListingTicker.trim() || !representation.source.trim() || !representation.sourceAsOf?.trim()) return null;
  if (!representation.ratioSource?.trim() || !representation.ratioAsOf?.trim()) return null;

  const basis = verifyDepositaryReceiptShareBasis(representation);
  if (!basis.verified || basis.underlyingSharesPerReceipt === null) return null;
  if (depositaryReceiptCurrencyState(representation) !== "fx_required") return null;

  const receiptCurrency = normalizedCurrency(representation.receiptTradingCurrency);
  const primaryCurrency = normalizedCurrency(representation.primaryListingCurrency);
  const marketCurrency = normalizedCurrency(market.currency);
  if (!receiptCurrency || !primaryCurrency || marketCurrency !== receiptCurrency) return null;

  return {
    id: company.securityId.trim(),
    currency: receiptCurrency,
    targetCurrency: primaryCurrency,
    date: market.date.slice(0, 10),
  };
}
