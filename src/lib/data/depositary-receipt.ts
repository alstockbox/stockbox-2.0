import {
  depositaryReceiptCurrencyState,
  verifyDepositaryReceiptShareBasis,
  type DepositaryReceiptRepresentation as AnalysisDepositaryReceiptRepresentation,
} from "@/lib/analysis/depositary-receipt";
import type { CompanyFundamentals, CompanySearchResult, MarketSnapshot } from "@/lib/analysis/types";
import { convertWithComparisonFxContext, type ComparisonFxContext } from "./ecb-fx";

export type DepositaryReceiptRepresentation = AnalysisDepositaryReceiptRepresentation & {
  kind: "ADR" | "ADS";
  mappingVerified: boolean;
  ratioVerified: boolean;
  source: string;
  sourceAsOf?: string | null;
};

export type DepositaryReceiptCompany = CompanySearchResult & {
  depositaryReceipt?: DepositaryReceiptRepresentation;
};

export type DepositaryReceiptFundamentalsAccess = {
  allowed: boolean;
  scope: "none" | "issuer_fundamentals_only" | "issuer_and_valuation";
  reason: string;
};

export type DepositaryReceiptFundamentalsIdentity = {
  verified: boolean;
  reason: string;
};

export type DepositaryReceiptValuationAccess = {
  allowed: boolean;
  underlyingSharesPerReceipt: number | null;
  reason: string;
};

const MAX_ADR_MARKET_CAP_SHARE_BASIS_DIFFERENCE = 0.05;

function isDepositaryReceipt(company: CompanySearchResult): boolean {
  return company.securityType === "ADR";
}

function representationFor(company: CompanySearchResult): DepositaryReceiptRepresentation | null {
  return (company as DepositaryReceiptCompany).depositaryReceipt ?? null;
}

function normalizedCurrency(value: string | null | undefined): string | null {
  const currency = value?.trim().toUpperCase();
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function positiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function relativeDifference(left: number, right: number): number {
  return Math.abs(left - right) / Math.max(Math.abs(left), Math.abs(right), 1);
}

function verifiedIssuerMapping(
  company: CompanySearchResult,
  representation: DepositaryReceiptRepresentation | null,
): { ok: boolean; reason: string } {
  if (!representation) {
    return { ok: false, reason: "Depositary-receipt issuer mapping and primary listing are unavailable." };
  }
  if (!representation.mappingVerified) {
    return { ok: false, reason: "Depositary-receipt issuer mapping has not been independently verified." };
  }
  if (!company.issuerId || !representation.issuerId || company.issuerId !== representation.issuerId) {
    return { ok: false, reason: "Depositary-receipt issuer identity does not match the verified issuer mapping." };
  }
  if (!representation.primaryListingTicker.trim()) {
    return { ok: false, reason: "Depositary-receipt primary listing is unavailable." };
  }
  if (!representation.source.trim() || !representation.sourceAsOf?.trim()) {
    return { ok: false, reason: "Depositary-receipt mapping lacks authoritative source provenance." };
  }
  return { ok: true, reason: "Verified issuer and primary-listing mapping is available." };
}

function verifiedFxContext(
  representation: DepositaryReceiptRepresentation,
  fxContext: ComparisonFxContext | undefined,
): { ok: boolean; reason: string } {
  const receiptCurrency = normalizedCurrency(representation.receiptTradingCurrency);
  const primaryCurrency = normalizedCurrency(representation.primaryListingCurrency);
  if (!receiptCurrency || !primaryCurrency) {
    return { ok: false, reason: "Depositary-receipt FX currencies are unresolved." };
  }
  if (!fxContext || fxContext.status !== "normalized") {
    return { ok: false, reason: "A normalized verified FX context is unavailable." };
  }
  if (normalizedCurrency(fxContext.sourceCurrency) !== receiptCurrency) {
    return { ok: false, reason: "FX source currency does not match the verified depositary-receipt trading currency." };
  }
  if (normalizedCurrency(fxContext.targetCurrency) !== primaryCurrency) {
    return { ok: false, reason: "FX target currency does not match the verified primary-listing currency." };
  }
  if (!fxContext.rateDate?.trim() || !positiveFinite(fxContext.sourceRatePerEuro) || !positiveFinite(fxContext.targetRatePerEuro)) {
    return { ok: false, reason: "FX rate provenance or positive reference rates are incomplete." };
  }
  const oneUnit = convertWithComparisonFxContext(1, fxContext);
  if (!positiveFinite(oneUnit)) {
    return { ok: false, reason: "FX context cannot produce a valid receipt-to-primary currency conversion." };
  }
  return { ok: true, reason: "Verified FX context reconciles receipt and primary-listing currencies." };
}

function fxContextMatchesMarketDate(fxContext: ComparisonFxContext, marketDate: string | null): boolean {
  if (!marketDate || !fxContext.rateDate) return false;
  const marketDay = Date.parse(`${marketDate.slice(0, 10)}T00:00:00Z`);
  const rateDay = Date.parse(`${fxContext.rateDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(marketDay) || !Number.isFinite(rateDay) || rateDay > marketDay) return false;
  return Math.floor((marketDay - rateDay) / 86_400_000) <= 7;
}

export function verifyDepositaryReceiptFundamentalsIdentity(
  company: CompanySearchResult,
  fundamentals: CompanyFundamentals,
): DepositaryReceiptFundamentalsIdentity {
  if (!isDepositaryReceipt(company)) {
    return { verified: true, reason: "Security is not a depositary receipt." };
  }

  const representation = representationFor(company);
  const mapping = verifiedIssuerMapping(company, representation);
  if (!mapping.ok) return { verified: false, reason: mapping.reason };

  const expectedIssuerId = company.issuerId?.trim();
  const fundamentalsIssuerId = fundamentals.entityId?.trim();
  if (!expectedIssuerId || !fundamentalsIssuerId) {
    return {
      verified: false,
      reason: "Depositary-receipt issuer identity cannot be reconciled because fundamentals lack a stable issuer identity.",
    };
  }
  if (fundamentalsIssuerId !== expectedIssuerId || fundamentalsIssuerId !== representation?.issuerId.trim()) {
    return {
      verified: false,
      reason: "Depositary-receipt fundamentals belong to a different issuer than the verified receipt-to-primary-listing mapping.",
    };
  }

  return {
    verified: true,
    reason: "Fundamentals issuer identity matches the verified depositary-receipt issuer and primary-listing mapping.",
  };
}

export function assessDepositaryReceiptFundamentalsAccess(
  company: CompanySearchResult,
): DepositaryReceiptFundamentalsAccess {
  if (!isDepositaryReceipt(company)) {
    return {
      allowed: company.securityType === "Common Stock" || company.securityType == null,
      scope: company.securityType === "Common Stock" || company.securityType == null ? "issuer_and_valuation" : "none",
      reason: "Security is not a depositary receipt.",
    };
  }

  const representation = representationFor(company);
  const mapping = verifiedIssuerMapping(company, representation);
  if (!mapping.ok) return { allowed: false, scope: "none", reason: mapping.reason };

  const valuation = assessDepositaryReceiptValuationAccess(company);
  return valuation.allowed
    ? {
        allowed: true,
        scope: "issuer_and_valuation",
        reason: "Verified issuer mapping, share ratio and same-currency share basis are available.",
      }
    : {
        allowed: true,
        scope: "issuer_fundamentals_only",
        reason: `Verified issuer mapping is available, but per-share valuation remains disabled: ${valuation.reason}`,
      };
}

export function assessDepositaryReceiptValuationAccess(
  company: CompanySearchResult,
  fxContext?: ComparisonFxContext,
): DepositaryReceiptValuationAccess {
  if (!isDepositaryReceipt(company)) {
    return {
      allowed: true,
      underlyingSharesPerReceipt: 1,
      reason: "Security is not a depositary receipt and does not require ADR/ADS reconciliation.",
    };
  }

  const representation = representationFor(company);
  const mapping = verifiedIssuerMapping(company, representation);
  if (!mapping.ok) {
    return { allowed: false, underlyingSharesPerReceipt: null, reason: mapping.reason };
  }
  if (!representation?.ratioVerified) {
    return {
      allowed: false,
      underlyingSharesPerReceipt: null,
      reason: "Depositary-receipt share ratio is not verified; per-share valuation share basis is unresolved.",
    };
  }

  const basis = verifyDepositaryReceiptShareBasis(representation);
  if (!basis.verified || basis.underlyingSharesPerReceipt === null) {
    return { allowed: false, underlyingSharesPerReceipt: null, reason: basis.reason };
  }

  const currencyState = depositaryReceiptCurrencyState(representation);
  if (currencyState === "unknown") {
    return {
      allowed: false,
      underlyingSharesPerReceipt: null,
      reason: "Depositary-receipt and primary-listing currency identity is unresolved.",
    };
  }
  if (currencyState === "fx_required") {
    const fx = verifiedFxContext(representation, fxContext);
    if (!fx.ok) {
      return {
        allowed: false,
        underlyingSharesPerReceipt: null,
        reason: `Depositary-receipt valuation requires verified FX normalization: ${fx.reason}`,
      };
    }
  }

  return {
    allowed: true,
    underlyingSharesPerReceipt: basis.underlyingSharesPerReceipt,
    reason: currencyState === "aligned"
      ? "Verified depositary-receipt share ratio reconciles receipt and underlying share basis in the same currency."
      : "Verified depositary-receipt share ratio and FX context reconcile receipt and primary-listing valuation basis.",
  };
}

function scaleFinite(value: number | null | undefined, scale: number): number | null | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value * scale : value;
}

function disabledValuationInputs(
  market: MarketSnapshot | null,
  fundamentals: CompanyFundamentals,
  reason: string,
) {
  return {
    market: market ? {
      ...market,
      price: null,
      yearHigh: null,
      yearLow: null,
      priceHistory: undefined,
      dividendEvents: undefined,
      marketCap: null,
      marketCapAsOf: null,
      marketCapCurrency: null,
      sharesOutstanding: null,
      sharesOutstandingAsOf: null,
    } : null,
    fundamentals: {
      ...fundamentals,
      reportedMarketCap: null,
      reportedMarketCapDate: null,
      reportedMarketCapCurrency: null,
      reportedSharesOutstanding: null,
      reportedSharesDate: null,
      reportedValuation: undefined,
    },
    warning: `ADR/ADS issuer fundamentals are available, but valuation is disabled because ${reason}`,
  };
}

export function disableDepositaryReceiptValuationInputs(
  market: MarketSnapshot | null,
  fundamentals: CompanyFundamentals,
  reason: string,
) {
  return disabledValuationInputs(market, fundamentals, reason);
}

function normalizedMarketCapForPrimaryCurrency(
  market: MarketSnapshot,
  primaryCurrency: string,
  receiptCurrency: string,
  fxContext: ComparisonFxContext,
): { value: number | null; currency: string | null; asOf: string | null } {
  if (!positiveFinite(market.marketCap)) return { value: null, currency: null, asOf: null };
  const marketCapCurrency = normalizedCurrency(market.marketCapCurrency);
  if (marketCapCurrency === primaryCurrency) {
    return { value: market.marketCap, currency: primaryCurrency, asOf: market.marketCapAsOf ?? market.date };
  }
  if (marketCapCurrency !== receiptCurrency) return { value: null, currency: null, asOf: null };
  const marketCapDate = market.marketCapAsOf ?? market.date;
  if (!marketCapDate || !market.date || marketCapDate.slice(0, 10) !== market.date.slice(0, 10)) {
    return { value: null, currency: null, asOf: null };
  }
  const converted = convertWithComparisonFxContext(market.marketCap, fxContext);
  return positiveFinite(converted)
    ? { value: converted, currency: primaryCurrency, asOf: marketCapDate }
    : { value: null, currency: null, asOf: null };
}

function marketCapMatchesVerifiedShareBasis(candidate: number | null, impliedMarketCap: number | null): boolean {
  if (!positiveFinite(candidate) || !positiveFinite(impliedMarketCap)) return false;
  return relativeDifference(candidate, impliedMarketCap) <= MAX_ADR_MARKET_CAP_SHARE_BASIS_DIFFERENCE;
}

export function gateDepositaryReceiptValuationInputs(
  company: CompanySearchResult,
  market: MarketSnapshot | null,
  fundamentals: CompanyFundamentals,
  fxContext?: ComparisonFxContext,
): {
  market: MarketSnapshot | null;
  fundamentals: CompanyFundamentals;
  warning: string | null;
} {
  if (!isDepositaryReceipt(company)) return { market, fundamentals, warning: null };

  const identity = verifyDepositaryReceiptFundamentalsIdentity(company, fundamentals);
  if (!identity.verified) return disabledValuationInputs(market, fundamentals, identity.reason);

  const representation = representationFor(company);
  if (!representation) return disabledValuationInputs(market, fundamentals, "depositary-receipt representation is unavailable.");

  const receiptCurrency = normalizedCurrency(representation.receiptTradingCurrency);
  const primaryCurrency = normalizedCurrency(representation.primaryListingCurrency);
  const marketCurrency = normalizedCurrency(market?.currency);
  if (market && (!receiptCurrency || marketCurrency !== receiptCurrency)) {
    return disabledValuationInputs(
      market,
      fundamentals,
      "market quote currency does not match the verified depositary-receipt trading currency.",
    );
  }

  const valuation = assessDepositaryReceiptValuationAccess(company, fxContext);
  if (!valuation.allowed || valuation.underlyingSharesPerReceipt === null) {
    return disabledValuationInputs(market, fundamentals, valuation.reason);
  }

  const ratio = valuation.underlyingSharesPerReceipt;
  const issuerShares = positiveFinite(fundamentals.reportedSharesOutstanding)
    ? fundamentals.reportedSharesOutstanding
    : null;
  const currencyState = depositaryReceiptCurrencyState(representation);

  if (currencyState === "aligned") {
    return {
      market: market ? {
        ...market,
        price: scaleFinite(market.price, 1 / ratio) ?? null,
        yearHigh: scaleFinite(market.yearHigh, 1 / ratio) ?? null,
        yearLow: scaleFinite(market.yearLow, 1 / ratio) ?? null,
        sharesOutstanding: issuerShares,
        sharesOutstandingAsOf: issuerShares !== null ? fundamentals.reportedSharesDate ?? null : null,
      } : null,
      fundamentals,
      warning: null,
    };
  }

  if (!fxContext || !primaryCurrency || !receiptCurrency || !market || !fxContextMatchesMarketDate(fxContext, market.date)) {
    return disabledValuationInputs(
      market,
      fundamentals,
      "verified FX context is missing, stale, future-dated, or lacks a current market date.",
    );
  }

  const convertedPrice = market.price === null ? null : convertWithComparisonFxContext(market.price, fxContext);
  if (market.price !== null && !positiveFinite(convertedPrice)) {
    return disabledValuationInputs(market, fundamentals, "current depositary-receipt price could not be normalized through verified FX.");
  }

  const underlyingPrice = convertedPrice === null ? null : convertedPrice / ratio;
  const impliedMarketCap = positiveFinite(underlyingPrice) && issuerShares !== null
    ? underlyingPrice * issuerShares
    : null;
  const convertedMarketCap = normalizedMarketCapForPrimaryCurrency(market, primaryCurrency, receiptCurrency, fxContext);
  const normalizedFundamentalsMarketCap = normalizedCurrency(fundamentals.reportedMarketCapCurrency) === primaryCurrency
    && positiveFinite(fundamentals.reportedMarketCap)
    ? fundamentals.reportedMarketCap
    : null;

  const convertedCapUsable = marketCapMatchesVerifiedShareBasis(convertedMarketCap.value, impliedMarketCap);
  const fundamentalsCapUsable = marketCapMatchesVerifiedShareBasis(normalizedFundamentalsMarketCap, impliedMarketCap);
  const hasComparableCandidate = positiveFinite(impliedMarketCap)
    && (positiveFinite(convertedMarketCap.value) || positiveFinite(normalizedFundamentalsMarketCap));
  const shareBasisConflict = hasComparableCandidate && !convertedCapUsable && !fundamentalsCapUsable;

  const selectedMarketCap = convertedCapUsable
    ? convertedMarketCap.value
    : fundamentalsCapUsable
      ? normalizedFundamentalsMarketCap
      : null;
  const selectedMarketCapAsOf = convertedCapUsable
    ? convertedMarketCap.asOf
    : fundamentalsCapUsable
      ? fundamentals.reportedMarketCapDate ?? null
      : null;

  return {
    market: {
      ...market,
      price: underlyingPrice,
      currency: primaryCurrency,
      yearHigh: null,
      yearLow: null,
      marketCap: selectedMarketCap,
      marketCapAsOf: selectedMarketCapAsOf,
      marketCapCurrency: selectedMarketCap !== null ? primaryCurrency : null,
      sharesOutstanding: issuerShares,
      sharesOutstandingAsOf: issuerShares !== null ? fundamentals.reportedSharesDate ?? null : null,
      priceHistory: undefined,
      dividendEvents: undefined,
    },
    fundamentals: {
      ...fundamentals,
      reportedMarketCap: shareBasisConflict ? null : fundamentals.reportedMarketCap,
      reportedMarketCapDate: shareBasisConflict ? null : fundamentals.reportedMarketCapDate,
      reportedMarketCapCurrency: shareBasisConflict ? null : fundamentals.reportedMarketCapCurrency,
      reportedValuation: undefined,
    },
    warning: shareBasisConflict
      ? "ADR/ADS market cap was discarded because converted provider and issuer-reported market caps conflict by more than 5% with verified normalized price times issuer shares; canonical valuation must derive market cap from the verified share basis instead."
      : null,
  };
}
