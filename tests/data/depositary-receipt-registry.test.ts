import { describe, expect, it } from "vitest";
import type { CompanySearchResult } from "../../src/lib/analysis/types";
import {
  attachVerifiedDepositaryReceiptRepresentation,
  qaDepositaryReceiptRegistry,
  type DepositaryReceiptRegistryEntry,
} from "../../src/lib/data/depositary-receipt-registry";

const verifiedEntry = (overrides: Partial<DepositaryReceiptRegistryEntry> = {}): DepositaryReceiptRegistryEntry => ({
  securityId: "adr:issuer-novo:nvo",
  issuerId: "issuer-novo",
  receiptTicker: "NVO",
  primaryListingTicker: "NOVO-B.CO",
  kind: "ADR",
  underlyingSharesPerReceipt: 0.5,
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
  });

  it("does not attach a ticker-only match when stable identity disagrees", () => {
    const result = attachVerifiedDepositaryReceiptRepresentation(company({ issuerId: "issuer-other" }), [verifiedEntry()]);
    expect(result.depositaryReceipt).toBeUndefined();
  });

  it("does not attach unverified mappings or ratios as verified data", () => {
    const result = attachVerifiedDepositaryReceiptRepresentation(company(), [verifiedEntry({ mappingVerified: false })]);
    expect(result.depositaryReceipt).toBeUndefined();
  });

  it("reports duplicate stable identities and invalid ratios as QA failures", () => {
    const report = qaDepositaryReceiptRegistry([
      verifiedEntry(),
      verifiedEntry({ sourceUrl: "https://example.invalid/duplicate" }),
      verifiedEntry({ securityId: "adr:issuer-tsm:tsm", issuerId: "issuer-tsm", receiptTicker: "TSM", underlyingSharesPerReceipt: 0 }),
    ]);

    expect(report.duplicateSecurityIds).toEqual(["adr:issuer-novo:nvo"]);
    expect(report.invalidRatioSecurityIds).toEqual(["adr:issuer-tsm:tsm"]);
    expect(report.pass).toBe(false);
  });

  it("requires source provenance and primary-listing identity", () => {
    const report = qaDepositaryReceiptRegistry([
      verifiedEntry({ source: "", sourceUrl: "", primaryListingTicker: "" }),
    ]);

    expect(report.missingSourceSecurityIds).toEqual(["adr:issuer-novo:nvo"]);
    expect(report.missingPrimaryListingSecurityIds).toEqual(["adr:issuer-novo:nvo"]);
    expect(report.pass).toBe(false);
  });
});
