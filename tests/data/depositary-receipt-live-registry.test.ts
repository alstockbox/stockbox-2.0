import { describe, expect, it } from "vitest";
import {
  attachVerifiedDepositaryReceiptRepresentation,
  qaDepositaryReceiptRegistry,
  verifiedDepositaryReceiptRegistry,
} from "../../src/lib/data/depositary-receipt-registry";

describe("source-backed live depositary-receipt registry", () => {
  it("activates Novo Nordisk NVO only from the verified SEC issuer identity and 1:1 ADR mapping", () => {
    const qa = qaDepositaryReceiptRegistry(verifiedDepositaryReceiptRegistry);
    const nvo = verifiedDepositaryReceiptRegistry.find((entry) => entry.receiptTicker === "NVO");

    expect(qa.pass).toBe(true);
    expect(nvo).toEqual(expect.objectContaining({
      securityId: "adr:sec:0000353278:nvo",
      issuerId: "sec:0000353278",
      receiptTicker: "NVO",
      primaryListingTicker: "NOVO-B.CO",
      kind: "ADR",
      underlyingSharesPerReceipt: 1,
      issuerReportingCurrency: "DKK",
      primaryListingCurrency: "DKK",
      receiptTradingCurrency: "USD",
      mappingVerified: true,
      ratioVerified: true,
      sourceAsOf: "2026-02-04",
      ratioAsOf: "2026-02-04",
    }));
    expect(nvo?.sourceUrl).toBe("https://www.sec.gov/Archives/edgar/data/353278/000035327826000012/nvo-20251231.htm");
    expect(nvo?.source).toContain("Form 20-F 2025 Item 12D");
    expect(nvo?.ratioSource).toContain("Form 20-F 2025 Item 12D");

    const attached = attachVerifiedDepositaryReceiptRepresentation({
      ticker: "NVO",
      canonicalTicker: "NVO",
      name: "Novo Nordisk A/S American Depositary Receipt",
      securityType: "ADR",
      issuerId: "sec:0000353278",
      entityId: "sec:0000353278",
      cik: "0000353278",
      exchange: "NYSE",
      country: "US",
      currency: "USD",
      providerCapabilities: {
        fundamentals: false,
        marketData: true,
        providerIds: ["sec-ticker-universe"],
      },
    });

    expect(attached.securityId).toBe("adr:sec:0000353278:nvo");
    expect(attached.depositaryReceipt).toEqual(expect.objectContaining({
      issuerId: "sec:0000353278",
      primaryListingTicker: "NOVO-B.CO",
      underlyingSharesPerReceipt: 1,
      receiptTradingCurrency: "USD",
      ratioVerified: true,
    }));
  });
});
