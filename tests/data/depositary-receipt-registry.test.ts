import { describe, expect, it } from "vitest";
import type { CompanySearchResult } from "../../src/lib/analysis/types";
import {
  attachVerifiedDepositaryReceiptRepresentation,
  qaDepositaryReceiptRegistry,
  type DepositaryReceiptRegistryEntry,
} from "../../src/lib/data/depositary-receipt-registry";
import { assessDepositaryReceiptFundamentalsAccess, assessDepositaryReceiptValuationAccess } from "../../src/lib/data/depositary-receipt";

const verifiedEntry = (overrides: Partial<DepositaryReceiptRegistryEntry> = {}): DepositaryReceiptRegistryEntry => ({
  securityId: "adr:issuer-novo:nvo",
  issuerId: "issuer-novo",
  receiptTicker: "NVO",
  primaryListingTicker: "NOVO-B.CO",
  kind: "ADR",
  underlyingSharesPerReceipt: 0.5,
  issuerReportingCurrency: "DKK",
  primaryListingCurrency: "DKK",
  receiptTradingCurrency: "DKK",
  ratioSource: "depositary disclosure",
  ratioAsOf: "2026-09-01",
  source: "issuer filing",
  sourceUrl: "https://example.invalid/issuer-filing",
  sourceAsOf: "2026-09-01",
  mappingVerified: true,
  ratioVerified: true,
  ...overrides,
});

const company = (overrides: Partial<CompanySearchResult> = {}): CompanySearchResult => ({
  securityId: "adr:issuer-novo:nvo",
  issuerId: "issuer-novo",
  ticker: "NVO",
  canonicalTicker: "NVO",
  name: "Novo Nordisk A/S ADR",
  securityType: "ADR",
  ...overrides,
});

describe("depositary receipt registry", () => {
  it("attaches a verified representation by stable security and issuer identity", () => {
    const result = attachVerifiedDepositaryReceiptRepresentation(company(), [verifiedEntry()]);
    expect(result.depositaryReceipt?.primaryListingTicker).toBe("NOVO-B.CO");
    expect(result.depositaryReceipt?.underlyingSharesPerReceipt).toBe(0.5);
    expect(result.depositaryReceipt?.ratioSource).toBe("depositary disclosure");
  });

  it("assigns the authoritative registry security id when discovery has stable issuer identity but no security id", () => {
    const result = attachVerifiedDepositaryReceiptRepresentation(
      company({ securityId: undefined }),
      [verifiedEntry()],
    );

    expect(result.securityId).toBe("adr:issuer-novo:nvo");
    expect(result.issuerId).toBe("issuer-novo");
    expect(result.depositaryReceipt?.primaryListingTicker).toBe("NOVO-B.CO");
  });

  it("does not overwrite a conflicting discovered security id", () => {
    const result = attachVerifiedDepositaryReceiptRepresentation(
      company({ securityId: "adr:issuer-novo:other" }),
      [verifiedEntry()],
    );

    expect(result.securityId).toBe("adr:issuer-novo:other");
    expect(result.depositaryReceipt).toBeUndefined();
  });

  it("does not attach when issuer and receipt ticker match more than one registry security", () => {
    const result = attachVerifiedDepositaryReceiptRepresentation(
      company({ securityId: undefined }),
      [
        verifiedEntry(),
        verifiedEntry({ securityId: "adr:issuer-novo:nvo-alt", sourceUrl: "https://example.invalid/alternate" }),
      ],
    );

    expect(result.securityId).toBeUndefined();
    expect(result.depositaryReceipt).toBeUndefined();
  });

  it("does not use receipt ticker alone when issuer identity is missing", () => {
    const result = attachVerifiedDepositaryReceiptRepresentation(
      company({ securityId: undefined, issuerId: undefined }),
      [verifiedEntry()],
    );

    expect(result.securityId).toBeUndefined();
    expect(result.depositaryReceipt).toBeUndefined();
  });

  it("does not attach a ticker-only match when stable identity disagrees", () => {
    const result = attachVerifiedDepositaryReceiptRepresentation(company({ issuerId: "issuer-other" }), [verifiedEntry()]);
    expect(result.depositaryReceipt).toBeUndefined();
  });

  it("does not attach an unverified issuer mapping", () => {
    const result = attachVerifiedDepositaryReceiptRepresentation(company(), [verifiedEntry({ mappingVerified: false })]);
    expect(result.depositaryReceipt).toBeUndefined();
  });

  it("attaches verified issuer mapping without a verified ratio for issuer-only fundamentals", () => {
    const result = attachVerifiedDepositaryReceiptRepresentation(company(), [verifiedEntry({
      ratioVerified: false,
      underlyingSharesPerReceipt: null,
      ratioSource: null,
      ratioAsOf: null,
    })]);

    expect(result.depositaryReceipt?.mappingVerified).toBe(true);
    expect(result.depositaryReceipt?.ratioVerified).toBe(false);
    expect(assessDepositaryReceiptFundamentalsAccess(result).scope).toBe("issuer_fundamentals_only");
    expect(assessDepositaryReceiptValuationAccess(result).allowed).toBe(false);
  });

  it("reports duplicate stable identities and invalid verified ratios as QA failures", () => {
    const report = qaDepositaryReceiptRegistry([
      verifiedEntry(),
      verifiedEntry({ sourceUrl: "https://example.invalid/duplicate" }),
      verifiedEntry({ securityId: "adr:issuer-tsm:tsm", issuerId: "issuer-tsm", receiptTicker: "TSM", underlyingSharesPerReceipt: 0 }),
    ]);

    expect(report.duplicateSecurityIds).toEqual(["adr:issuer-novo:nvo"]);
    expect(report.invalidRatioSecurityIds).toEqual(["adr:issuer-tsm:tsm"]);
    expect(report.pass).toBe(false);
  });

  it("rejects ambiguous issuer and receipt-ticker keys even when security ids differ", () => {
    const report = qaDepositaryReceiptRegistry([
      verifiedEntry(),
      verifiedEntry({
        securityId: "adr:issuer-novo:nvo-alt",
        sourceUrl: "https://example.invalid/alternate",
      }),
    ]);

    expect(report.ambiguousIssuerReceiptKeys).toEqual(["ISSUER-NOVO|NVO"]);
    expect(report.duplicateSecurityIds).toEqual([]);
    expect(report.pass).toBe(false);
  });

  it("tracks unverified ratios without treating issuer mapping as invalid", () => {
    const report = qaDepositaryReceiptRegistry([
      verifiedEntry({ ratioVerified: false, underlyingSharesPerReceipt: null, ratioSource: null, ratioAsOf: null }),
    ]);

    expect(report.unverifiedMappingSecurityIds).toEqual([]);
    expect(report.unverifiedRatioSecurityIds).toEqual(["adr:issuer-novo:nvo"]);
    expect(report.pass).toBe(true);
  });

  it("requires mapping source provenance and primary-listing identity", () => {
    const report = qaDepositaryReceiptRegistry([
      verifiedEntry({ source: "", sourceUrl: "", primaryListingTicker: "" }),
    ]);

    expect(report.missingSourceSecurityIds).toEqual(["adr:issuer-novo:nvo"]);
    expect(report.missingPrimaryListingSecurityIds).toEqual(["adr:issuer-novo:nvo"]);
    expect(report.pass).toBe(false);
  });

  it("requires ratio provenance whenever a ratio is marked verified", () => {
    const report = qaDepositaryReceiptRegistry([
      verifiedEntry({ ratioSource: null, ratioAsOf: null }),
    ]);

    expect(report.invalidRatioProvenanceSecurityIds).toEqual(["adr:issuer-novo:nvo"]);
    expect(report.pass).toBe(false);
  });
});
