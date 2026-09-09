import { describe, expect, it } from "vitest";
import type { CompanyFundamentals, CompanySearchResult } from "../../src/lib/analysis/types";
import {
  assessDepositaryReceiptFundamentalsAccess,
  verifyDepositaryReceiptFundamentalsIdentity,
  type DepositaryReceiptRepresentation,
} from "../../src/lib/data/depositary-receipt";

type AdrCompany = CompanySearchResult & { depositaryReceipt?: DepositaryReceiptRepresentation };

function company(): AdrCompany {
  return {
    securityId: "adr:issuer-novo:nvo",
    issuerId: "issuer-novo",
    ticker: "NVO",
    canonicalTicker: "NVO",
    name: "Novo Nordisk A/S ADR",
    securityType: "ADR",
    depositaryReceipt: {
      kind: "ADR",
      issuerId: "issuer-novo",
      receiptTicker: "NVO",
      primaryListingTicker: "NOVO-B.CO",
      underlyingSharesPerReceipt: 0.5,
      issuerReportingCurrency: "DKK",
      primaryListingCurrency: "DKK",
      receiptTradingCurrency: "USD",
      ratioSource: "depositary disclosure",
      ratioAsOf: "2026-09-01",
      mappingVerified: true,
      ratioVerified: true,
      source: "issuer filing",
      sourceAsOf: "2026-09-01",
    },
  };
}

function fundamentals(entityId?: string): CompanyFundamentals {
  return {
    ticker: "NVO",
    name: "Novo Nordisk A/S",
    entityId,
    sector: "healthcare",
    industry: "Drug Manufacturers",
    annual: [],
    annualPeriods: [],
    reportingCurrency: "DKK",
  };
}

describe("depositary-receipt issuer identity", () => {
  it("accepts issuer fundamentals only when the stable issuer identity matches the verified mapping", () => {
    const result = verifyDepositaryReceiptFundamentalsIdentity(company(), fundamentals("issuer-novo"));
    expect(result.verified).toBe(true);
  });

  it("fails closed when ADR fundamentals have no stable issuer identity", () => {
    const result = verifyDepositaryReceiptFundamentalsIdentity(company(), fundamentals());
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/issuer identity/i);
  });

  it("fails closed when ADR fundamentals belong to a different issuer", () => {
    const result = verifyDepositaryReceiptFundamentalsIdentity(company(), fundamentals("issuer-other"));
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/issuer/i);
  });

  it("fails closed instead of trimming a noncanonical fundamentals issuer identity", () => {
    const result = verifyDepositaryReceiptFundamentalsIdentity(
      company(),
      fundamentals(" issuer-novo "),
    );

    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/issuer|identity|canonical/i);
  });

  it("fails closed when both sides of the verified issuer mapping carry the same noncanonical opaque identity", () => {
    const dirty = company();
    dirty.issuerId = " issuer-novo ";
    dirty.depositaryReceipt!.issuerId = " issuer-novo ";

    const identity = verifyDepositaryReceiptFundamentalsIdentity(dirty, fundamentals("issuer-novo"));
    const access = assessDepositaryReceiptFundamentalsAccess(dirty);

    expect(identity.verified).toBe(false);
    expect(identity.reason).toMatch(/issuer|canonical|identity/i);
    expect(access.allowed).toBe(false);
    expect(access.scope).toBe("none");
  });
});
