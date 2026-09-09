import type { CompanySearchResult } from "@/lib/analysis/types";
import { assessDepositaryReceiptFundamentalsAccess } from "./depositary-receipt";
import { attachVerifiedDepositaryReceiptRepresentation } from "./depositary-receipt-registry";

const SEC_IDENTITY_PROVIDERS = new Set(["sec-ticker-universe", "sec-companyfacts"]);

function normalizedCik(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/g, "");
  return digits ? digits.padStart(10, "0") : null;
}

function exactTicker(company: CompanySearchResult): string {
  return (company.canonicalTicker ?? company.ticker).trim().toUpperCase();
}

function hasSecTickerIdentity(company: CompanySearchResult): boolean {
  return Boolean(company.providerCapabilities?.providerIds?.includes("sec-ticker-universe") && normalizedCik(company.cik));
}

function isSyntheticListingIdentity(company: CompanySearchResult): boolean {
  return !company.entityId || company.entityId.startsWith("listing:");
}

function isPureSecIdentityRepresentation(company: CompanySearchResult): boolean {
  const providers = company.providerCapabilities?.providerIds ?? [];
  return company.securityType === "Common Stock"
    && hasSecTickerIdentity(company)
    && providers.length > 0
    && providers.every((provider) => SEC_IDENTITY_PROVIDERS.has(provider));
}

function uniqueSecCiksByExactTicker(companies: CompanySearchResult[]): Map<string, string> {
  const grouped = new Map<string, Set<string>>();
  for (const company of companies) {
    if (!hasSecTickerIdentity(company)) continue;
    const cik = normalizedCik(company.cik);
    if (!cik) continue;
    const ticker = exactTicker(company);
    const ciks = grouped.get(ticker) ?? new Set<string>();
    ciks.add(cik);
    grouped.set(ticker, ciks);
  }

  return new Map(
    [...grouped.entries()]
      .filter(([, ciks]) => ciks.size === 1)
      .map(([ticker, ciks]) => [ticker, [...ciks][0]] as const),
  );
}

function attachVerifiedDepositaryReceiptSearchCapability(company: CompanySearchResult): CompanySearchResult {
  if (company.securityType !== "ADR") return company;

  const attached = attachVerifiedDepositaryReceiptRepresentation(company);
  const access = assessDepositaryReceiptFundamentalsAccess(attached);
  if (!access.allowed) return attached;

  const providerIds = new Set(attached.providerCapabilities?.providerIds ?? []);
  if (attached.cik) providerIds.add("sec-companyfacts");
  const marketData = Boolean(attached.providerCapabilities?.marketData);

  return {
    ...attached,
    providerCapabilities: {
      fundamentals: true,
      marketData,
      providerIds: [...providerIds].sort(),
    },
    analysisCapability: {
      fundamentals: access.scope === "issuer_and_valuation" ? "full" : "partial",
      marketData: marketData ? "available" : "unavailable",
      reason: access.reason,
    },
  };
}

export function reconcileDepositaryReceiptSearchIdentities(
  companies: CompanySearchResult[],
): CompanySearchResult[] {
  const uniqueSecCiks = uniqueSecCiksByExactTicker(companies);
  const reconciledAdrKeys = new Set<string>();

  const reconciled = companies.map((company) => {
    if (company.securityType !== "ADR") return company;

    const ticker = exactTicker(company);
    const secCik = uniqueSecCiks.get(ticker);
    if (!secCik) return company;

    const existingCik = normalizedCik(company.cik);
    if (existingCik && existingCik !== secCik) return company;

    const issuerId = `sec:${secCik}`;
    if (company.issuerId && company.issuerId !== issuerId) return company;
    if (!isSyntheticListingIdentity(company) && company.entityId !== issuerId) return company;

    reconciledAdrKeys.add(`${ticker}|${secCik}`);
    return {
      ...company,
      cik: secCik,
      issuerId,
      entityId: issuerId,
      primarySecurity: false,
      providerCapabilities: {
        fundamentals: false,
        marketData: Boolean(company.providerCapabilities?.marketData),
        providerIds: [...new Set([
          ...(company.providerCapabilities?.providerIds ?? []),
          "sec-ticker-universe",
        ])].sort(),
      },
    };
  });

  return reconciled
    .filter((company) => {
      if (!isPureSecIdentityRepresentation(company)) return true;
      const cik = normalizedCik(company.cik);
      if (!cik) return true;
      return !reconciledAdrKeys.has(`${exactTicker(company)}|${cik}`);
    })
    .map(attachVerifiedDepositaryReceiptSearchCapability);
}
