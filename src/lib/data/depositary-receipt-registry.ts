import type { CompanySearchResult } from "@/lib/analysis/types";
import type { DepositaryReceiptCompany, DepositaryReceiptRepresentation } from "./depositary-receipt";

export type DepositaryReceiptRegistryEntry = DepositaryReceiptRepresentation & {
  securityId: string;
  receiptTicker: string;
  sourceUrl: string;
};

export type DepositaryReceiptRegistryQaReport = {
  pass: boolean;
  totalEntries: number;
  duplicateSecurityIds: string[];
  invalidRatioSecurityIds: string[];
  missingSourceSecurityIds: string[];
  missingPrimaryListingSecurityIds: string[];
  unverifiedMappingSecurityIds: string[];
  unverifiedRatioSecurityIds: string[];
};

function normalized(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function duplicateValues(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort();
}

function validPositiveRatio(entry: DepositaryReceiptRegistryEntry): boolean {
  return typeof entry.underlyingSharesPerReceipt === "number"
    && Number.isFinite(entry.underlyingSharesPerReceipt)
    && entry.underlyingSharesPerReceipt > 0;
}

export function qaDepositaryReceiptRegistry(
  entries: DepositaryReceiptRegistryEntry[],
): DepositaryReceiptRegistryQaReport {
  const duplicateSecurityIds = duplicateValues(entries.map((entry) => entry.securityId));
  const invalidRatioSecurityIds = entries
    .filter((entry) => entry.ratioVerified && !validPositiveRatio(entry))
    .map((entry) => entry.securityId)
    .sort();
  const missingSourceSecurityIds = entries
    .filter((entry) => !entry.source.trim() || !entry.sourceUrl.trim() || !entry.sourceAsOf?.trim())
    .map((entry) => entry.securityId)
    .sort();
  const missingPrimaryListingSecurityIds = entries
    .filter((entry) => !entry.primaryListingTicker.trim() || !entry.issuerId.trim() || !entry.receiptTicker.trim())
    .map((entry) => entry.securityId)
    .sort();
  const unverifiedMappingSecurityIds = entries
    .filter((entry) => !entry.mappingVerified)
    .map((entry) => entry.securityId)
    .sort();
  const unverifiedRatioSecurityIds = entries
    .filter((entry) => !entry.ratioVerified)
    .map((entry) => entry.securityId)
    .sort();

  return {
    pass: duplicateSecurityIds.length === 0
      && invalidRatioSecurityIds.length === 0
      && missingSourceSecurityIds.length === 0
      && missingPrimaryListingSecurityIds.length === 0
      && unverifiedMappingSecurityIds.length === 0,
    totalEntries: entries.length,
    duplicateSecurityIds,
    invalidRatioSecurityIds,
    missingSourceSecurityIds,
    missingPrimaryListingSecurityIds,
    unverifiedMappingSecurityIds,
    unverifiedRatioSecurityIds,
  };
}

function matchingRegistryEntry(
  company: CompanySearchResult,
  entries: DepositaryReceiptRegistryEntry[],
): DepositaryReceiptRegistryEntry | null {
  if (company.securityType !== "ADR" || !company.securityId || !company.issuerId) return null;
  const securityId = company.securityId.trim();
  const issuerId = company.issuerId.trim();
  const ticker = normalized(company.canonicalTicker ?? company.ticker);
  const candidates = entries.filter((entry) =>
    entry.securityId === securityId
    && entry.issuerId === issuerId
    && normalized(entry.receiptTicker) === ticker
  );
  if (candidates.length !== 1) return null;
  const entry = candidates[0];
  if (!entry.mappingVerified) return null;
  if (entry.ratioVerified && !validPositiveRatio(entry)) return null;
  if (!entry.source.trim() || !entry.sourceUrl.trim() || !entry.sourceAsOf?.trim() || !entry.primaryListingTicker.trim()) return null;
  return entry;
}

export function attachVerifiedDepositaryReceiptRepresentation(
  company: CompanySearchResult,
  entries: DepositaryReceiptRegistryEntry[],
): DepositaryReceiptCompany {
  const entry = matchingRegistryEntry(company, entries);
  if (!entry) return company as DepositaryReceiptCompany;
  return {
    ...company,
    depositaryReceipt: {
      kind: entry.kind,
      issuerId: entry.issuerId,
      primaryListingTicker: entry.primaryListingTicker,
      underlyingSharesPerReceipt: entry.ratioVerified ? entry.underlyingSharesPerReceipt : null,
      mappingVerified: true,
      ratioVerified: entry.ratioVerified,
      source: entry.source,
      sourceAsOf: entry.sourceAsOf,
    },
  };
}

// Intentionally empty until each mapping is backed by an authoritative issuer/depositary source.
// Ticker-only guesses are forbidden; add entries through reviewed source-backed data changes.
export const verifiedDepositaryReceiptRegistry: DepositaryReceiptRegistryEntry[] = [];
