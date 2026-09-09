import { describe, expect, it } from "vitest";
import type { CompanySearchResult } from "../../src/lib/analysis/types";
import {
  attachVerifiedDepositaryReceiptRepresentation,
  type DepositaryReceiptRegistryEntry,
} from "../../src/lib/data/depositary-receipt-registry";

const verifiedEntry: DepositaryReceiptRegistryEntry = {
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
};

function company(overrides: Partial<CompanySearchResult> = {}): CompanySearchResult {
  return {
    securityId: "adr:issuer-novo:nvo",
    issuerId: "issuer-novo",
    ticker: "NVO",
    canonicalTicker: "NVO",
    name: "Novo Nordisk A/S ADR",
    securityType: "ADR",
    ...overrides,
  };
}

describe("depositary receipt registry discovery identity", () => {
  it("fails closed instead of trimming a discovered stable security id", () => {
    const discovered = company({ securityId: " adr:issuer-novo:nvo " });
    const result = attachVerifiedDepositaryReceiptRepresentation(discovered, [verifiedEntry]);

    expect(result.securityId).toBe(" adr:issuer-novo:nvo ");
    expect(result.depositaryReceipt).toBeUndefined();
  });

  it("fails closed instead of trimming a discovered opaque issuer id", () => {
    const discovered = company({ issuerId: " issuer-novo " });
    const result = attachVerifiedDepositaryReceiptRepresentation(discovered, [verifiedEntry]);

    expect(result.issuerId).toBe(" issuer-novo ");
    expect(result.depositaryReceipt).toBeUndefined();
  });
});
