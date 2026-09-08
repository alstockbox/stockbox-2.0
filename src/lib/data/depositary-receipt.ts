import type { CompanySearchResult } from "@/lib/analysis/types";

export type DepositaryReceiptRepresentation = {
  kind: "ADR" | "ADS";
  issuerId: string;
  primaryListingTicker: string;
  underlyingSharesPerReceipt?: number | null;
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

export type DepositaryReceiptValuationAccess = {
  allowed: boolean;
  underlyingSharesPerReceipt: number | null;
  reason: string;
};

function isDepositaryReceipt(company: CompanySearchResult): boolean {
  return company.securityType === "ADR";
}

function representationFor(company: CompanySearchResult): DepositaryReceiptRepresentation | null {
  return (company as DepositaryReceiptCompany).depositaryReceipt ?? null;
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
  if (!representation.source.trim()) {
    return { ok: false, reason: "Depositary-receipt mapping lacks an authoritative source." };
  }
  return { ok: true, reason: "Verified issuer and primary-listing mapping is available." };
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
        reason: "Verified issuer mapping and verified depositary-receipt share ratio are available.",
      }
    : {
        allowed: true,
        scope: "issuer_fundamentals_only",
        reason: "Verified issuer mapping is available, but per-share valuation remains disabled until the depositary-receipt share ratio is verified.",
      };
}

export function assessDepositaryReceiptValuationAccess(
  company: CompanySearchResult,
): DepositaryReceiptValuationAccess {
  if (!isDepositaryReceipt(company)) {
    return {
      allowed: true,
      underlyingSharesPerReceipt: 1,
      reason: "Security is not a depositary receipt and does not require ADR/ADS ratio reconciliation.",
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
  const ratio = representation.underlyingSharesPerReceipt;
  if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio <= 0) {
    return {
      allowed: false,
      underlyingSharesPerReceipt: null,
      reason: "Depositary-receipt share ratio is invalid; per-share valuation share basis is unresolved.",
    };
  }
  return {
    allowed: true,
    underlyingSharesPerReceipt: ratio,
    reason: "Verified depositary-receipt share ratio reconciles receipt and underlying share basis.",
  };
}
