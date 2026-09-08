import { economicCurrencyCode, quotePriceToEconomic } from "@/lib/analysis/currency-units";
import type { CompanySearchResult, MarketSnapshot } from "@/lib/analysis/types";
import type { ComparisonFxContext } from "./ecb-fx";
import {
  assessDepositaryReceiptValuationAccess,
  type DepositaryReceiptCompany,
} from "./depositary-receipt";

const MAX_PRIMARY_LISTING_PRICE_DIFFERENCE = 0.05;

export type DepositaryReceiptPrimaryListingReconciliation = {
  status: "aligned" | "conflict" | "unavailable";
  relativeDifference: number | null;
  reason: string;
};

function positiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function relativeDifference(left: number, right: number): number {
  return Math.abs(left - right) / Math.max(Math.abs(left), Math.abs(right), 1);
}

export function buildDepositaryReceiptPrimaryListingCompany(
  company: CompanySearchResult,
  fxContext?: ComparisonFxContext,
): CompanySearchResult | null {
  if (company.securityType !== "ADR") return null;

  const representation = (company as DepositaryReceiptCompany).depositaryReceipt;
  if (!representation?.mappingVerified || !representation.ratioVerified) return null;
  if (!company.issuerId?.trim() || company.issuerId.trim() !== representation.issuerId.trim()) return null;
  if (!representation.primaryListingTicker.trim() || !representation.source.trim() || !representation.sourceAsOf?.trim()) return null;

  const valuation = assessDepositaryReceiptValuationAccess(company, fxContext);
  if (!valuation.allowed || valuation.underlyingSharesPerReceipt === null) return null;

  const ticker = representation.primaryListingTicker.trim().toUpperCase();
  return {
    securityId: `primary:${representation.issuerId.trim()}:${ticker}`,
    issuerId: representation.issuerId.trim(),
    entityId: representation.issuerId.trim(),
    ticker,
    canonicalTicker: ticker,
    name: `${company.name} primary listing`,
    securityType: "Common Stock",
    currency: representation.primaryListingCurrency ?? undefined,
    source: representation.source,
    sourceUpdatedAt: representation.sourceAsOf ?? undefined,
    providerCapabilities: {
      fundamentals: false,
      marketData: true,
      providerIds: [],
    },
    analysisCapability: {
      fundamentals: "unavailable",
      marketData: "available",
      reason: "Primary listing is requested only to reconcile depositary-receipt market-price representation.",
    },
  };
}

export function reconcileDepositaryReceiptPrimaryListingPrice(
  company: CompanySearchResult,
  normalizedAdrMarket: MarketSnapshot | null,
  primaryListingMarket: MarketSnapshot | null,
): DepositaryReceiptPrimaryListingReconciliation {
  if (company.securityType !== "ADR") {
    return { status: "unavailable", relativeDifference: null, reason: "Security is not a depositary receipt." };
  }

  const representation = (company as DepositaryReceiptCompany).depositaryReceipt;
  if (!representation?.mappingVerified || !representation.ratioVerified || !representation.source.trim() || !representation.sourceAsOf?.trim()) {
    return {
      status: "unavailable",
      relativeDifference: null,
      reason: "Verified source-backed depositary-receipt representation is unavailable.",
    };
  }
  if (!normalizedAdrMarket || !primaryListingMarket) {
    return { status: "unavailable", relativeDifference: null, reason: "ADR or primary-listing market quote is unavailable." };
  }
  if (!normalizedAdrMarket.date || !primaryListingMarket.date || normalizedAdrMarket.date.slice(0, 10) !== primaryListingMarket.date.slice(0, 10)) {
    return {
      status: "unavailable",
      relativeDifference: null,
      reason: "ADR and primary-listing prices are not from the same quote date.",
    };
  }

  const expectedCurrency = economicCurrencyCode(representation.primaryListingCurrency);
  const adrCurrency = economicCurrencyCode(normalizedAdrMarket.currency);
  const primaryCurrency = economicCurrencyCode(primaryListingMarket.currency);
  if (!expectedCurrency || adrCurrency !== expectedCurrency || primaryCurrency !== expectedCurrency) {
    return {
      status: "unavailable",
      relativeDifference: null,
      reason: "ADR and primary-listing quotes do not resolve to the verified primary-listing economic currency.",
    };
  }

  const adrPrice = quotePriceToEconomic(normalizedAdrMarket.price, normalizedAdrMarket.currency);
  const primaryPrice = quotePriceToEconomic(primaryListingMarket.price, primaryListingMarket.currency);
  if (!positiveFinite(adrPrice) || !positiveFinite(primaryPrice)) {
    return {
      status: "unavailable",
      relativeDifference: null,
      reason: "ADR or primary-listing economic price is unavailable or non-positive.",
    };
  }

  const difference = relativeDifference(adrPrice, primaryPrice);
  if (difference > MAX_PRIMARY_LISTING_PRICE_DIFFERENCE) {
    return {
      status: "conflict",
      relativeDifference: difference,
      reason: "Primary listing price conflicts materially with the normalized ADR-implied underlying price.",
    };
  }

  return {
    status: "aligned",
    relativeDifference: difference,
    reason: "Primary listing price aligns with the normalized ADR-implied underlying price within the 5% integrity tolerance.",
  };
}
