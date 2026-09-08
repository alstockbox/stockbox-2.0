import { describe, expect, it } from "vitest";
import {
  assessDepositaryReceiptFundamentalsAccess,
  assessDepositaryReceiptValuationAccess,
  type DepositaryReceiptRepresentation,
} from "../../src/lib/data/depositary-receipt";
import type { CompanySearchResult } from "../../src/lib/analysis/types";

type AdrCompany = CompanySearchResult & { depositaryReceipt?: DepositaryReceiptRepresentation };

function adr(overrides: Partial<AdrCompany> = {}): AdrCompany {
  return {
    ticker: "NVO",
    canonicalTicker: "NVO",
    name: "Novo Nordisk A/S ADR",
    securityType: "ADR",
    issuerId: "issuer-novo",
    currency: "USD",
    ...overrides,
  };
}

describe("depositary receipt reconciliation", () => {
  it("fails closed when ADR issuer mapping is missing", () => {
    const result = assessDepositaryReceiptFundamentalsAccess(adr());
    expect(result.allowed).toBe(false);
    expect(result.scope).toBe("none");
    expect(result.reason).toMatch(/mapping|primary listing|issuer/i);
  });

  it("allows issuer-level fundamentals only after verified issuer and primary-listing mapping", () => {
    const result = assessDepositaryReceiptFundamentalsAccess(adr({
      depositaryReceipt: {
        kind: "ADR",
        issuerId: "issuer-novo",
        primaryListingTicker: "NOVO-B.CO",
        mappingVerified: true,
        ratioVerified: false,
        source: "issuer filing",
      },
    }));

    expect(result.allowed).toBe(true);
    expect(result.scope).toBe("issuer_fundamentals_only");
  });

  it("keeps valuation unavailable until the ADR ratio is verified", () => {
    const result = assessDepositaryReceiptValuationAccess(adr({
      depositaryReceipt: {
        kind: "ADR",
        issuerId: "issuer-novo",
        primaryListingTicker: "NOVO-B.CO",
        mappingVerified: true,
        ratioVerified: false,
        source: "issuer filing",
      },
    }));

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/ratio|share basis/i);
  });

  it("allows valuation only with a positive verified underlying-shares-per-receipt ratio", () => {
    const result = assessDepositaryReceiptValuationAccess(adr({
      depositaryReceipt: {
        kind: "ADR",
        issuerId: "issuer-novo",
        primaryListingTicker: "NOVO-B.CO",
        underlyingSharesPerReceipt: 0.5,
        mappingVerified: true,
        ratioVerified: true,
        source: "issuer filing",
      },
    }));

    expect(result.allowed).toBe(true);
    expect(result.underlyingSharesPerReceipt).toBe(0.5);
  });

  it("rejects a mismatched issuer id even when mapping is marked verified", () => {
    const result = assessDepositaryReceiptFundamentalsAccess(adr({
      depositaryReceipt: {
        kind: "ADR",
        issuerId: "different-issuer",
        primaryListingTicker: "NOVO-B.CO",
        mappingVerified: true,
        ratioVerified: true,
        underlyingSharesPerReceipt: 0.5,
        source: "issuer filing",
      },
    }));

    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/issuer/i);
  });
});
