import { economicCurrencyCode, quotePriceToEconomic } from "@/lib/analysis/currency-units";
import { dataDateStatus, DATA_FRESHNESS_THRESHOLDS_DAYS } from "@/lib/analysis/freshness";
import { analyzeCompany as analyzeCoreCompany } from "./provider-core";
import { providerDiagnostic } from "./providers";
import { inferSecurityType } from "./security-classification";

export * from "./provider-core";

const ADR_MARKET_CAP_TOLERANCE = 0.05;
const ADR_MARKET_CAP_PRICE_GAP_DAYS = 5;
const ADR_BASIS_PROVIDER = "StockBox ADR listing basis";
const ADR_BASIS_REASON = "unverified_listing_share_basis";
const ADR_BASIS_ERROR = "ADR listing share basis could not be verified for analysis.";

type AnalyzeCompanyArgs = Parameters<typeof analyzeCoreCompany>[0];
type AnalyzeCompanyResult = Awaited<ReturnType<typeof analyzeCoreCompany>>;

type AdrBasisCheck = {
  verified: boolean;
  reason: string;
};

function finitePositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function daysBetween(left: string | null | undefined, right: string | null | undefined): number | null {
  if (!left || !right) return null;
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  if (!Number.isFinite(leftMs) || !Number.isFinite(rightMs)) return null;
  return Math.abs(leftMs - rightMs) / 86_400_000;
}

function verifyAdrListingBasis(result: Extract<AnalyzeCompanyResult, { ok: true }>): AdrBasisCheck {
  const report = result.data;
  const market = report.market;
  const latestPeriod = report.engine?.metrics.latestPeriod ?? null;
  const analysisDate = report.generatedAt;

  if (!market || !finitePositive(market.price)) {
    return { verified: false, reason: "ADR listing price is unavailable." };
  }
  if (!finitePositive(market.marketCap)) {
    return { verified: false, reason: "ADR listing market cap is unavailable." };
  }

  const marketCurrency = economicCurrencyCode(market.currency);
  const marketCapCurrency = economicCurrencyCode(market.marketCapCurrency);
  if (!marketCurrency || !marketCapCurrency || marketCurrency !== marketCapCurrency) {
    return { verified: false, reason: "ADR listing price and market cap currencies are not aligned." };
  }

  if (dataDateStatus(market.date, analysisDate, DATA_FRESHNESS_THRESHOLDS_DAYS.marketPrice).status !== "current") {
    return { verified: false, reason: "ADR listing price is stale or undated." };
  }
  if (dataDateStatus(market.marketCapAsOf, analysisDate, DATA_FRESHNESS_THRESHOLDS_DAYS.marketCap).status !== "current") {
    return { verified: false, reason: "ADR listing market cap is stale or undated." };
  }

  const shares = finitePositive(latestPeriod?.currentSharesOutstanding)
    ? latestPeriod.currentSharesOutstanding
    : finitePositive(latestPeriod?.sharesDiluted)
      ? latestPeriod.sharesDiluted
      : null;
  const sharesAsOf = latestPeriod?.balanceSheetDate ?? latestPeriod?.periodEndDate ?? null;
  if (!finitePositive(shares)) {
    return { verified: false, reason: "ADR issuer share count is unavailable." };
  }
  if (dataDateStatus(sharesAsOf, analysisDate, DATA_FRESHNESS_THRESHOLDS_DAYS.sharesOutstanding).status !== "current") {
    return { verified: false, reason: "ADR issuer share count is stale or undated." };
  }

  const priceCapGap = daysBetween(market.date, market.marketCapAsOf);
  if (priceCapGap === null || priceCapGap > ADR_MARKET_CAP_PRICE_GAP_DAYS) {
    return { verified: false, reason: "ADR listing price and market cap are not date-aligned." };
  }

  const economicPrice = quotePriceToEconomic(market.price, market.currency);
  if (!finitePositive(economicPrice)) {
    return { verified: false, reason: "ADR listing price unit could not be normalized." };
  }

  const impliedMarketCap = economicPrice * shares;
  if (!finitePositive(impliedMarketCap)) {
    return { verified: false, reason: "ADR listing market cap could not be reconciled from price and shares." };
  }
  const relativeDifference = Math.abs(market.marketCap - impliedMarketCap)
    / Math.max(market.marketCap, impliedMarketCap);
  if (!Number.isFinite(relativeDifference) || relativeDifference > ADR_MARKET_CAP_TOLERANCE) {
    return {
      verified: false,
      reason: `ADR listing market cap differs from normalized price × issuer shares by ${(relativeDifference * 100).toFixed(1)}%.`,
    };
  }

  return {
    verified: true,
    reason: `ADR listing basis reconciled within ${(relativeDifference * 100).toFixed(1)}%.`,
  };
}

export async function analyzeCompany(args: AnalyzeCompanyArgs): Promise<AnalyzeCompanyResult> {
  const result = await analyzeCoreCompany(args);
  if (!result.ok || inferSecurityType(args.company) !== "ADR") return result;

  const basis = verifyAdrListingBasis(result);
  if (basis.verified) {
    const diagnostic = providerDiagnostic(ADR_BASIS_PROVIDER, "fundamentals", "available", "listing_share_basis_verified");
    result.data.providerDiagnostics = [...(result.data.providerDiagnostics ?? []), diagnostic];
    if (result.data.adminQa) {
      result.data.adminQa.providerAttempts = [...result.data.adminQa.providerAttempts, diagnostic];
    }
    return result;
  }

  const diagnostic = providerDiagnostic(ADR_BASIS_PROVIDER, "fundamentals", "unsupported", ADR_BASIS_REASON);
  return {
    ok: false,
    error: ADR_BASIS_ERROR,
    sources: result.sources,
    warnings: [...result.warnings, basis.reason],
    providerDiagnostics: [...(result.data.providerDiagnostics ?? []), diagnostic],
  };
}
