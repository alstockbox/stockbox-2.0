import { describe, expect, it } from "vitest";

import { resolveInvestmentCompanyHoldingCandidate } from "../../src/lib/data/investment-company-holding-resolver";
import type { CompanySearchResult } from "../../src/lib/analysis/types";

function candidate(overrides: Partial<CompanySearchResult>): CompanySearchResult {
  return {
    ticker: "TEST.ST",
    name: "Test AB (publ)",
    securityType: "Common Stock",
    ...overrides,
  };
}

describe("investment-company holding resolver", () => {
  it("resolves a brand name to one unambiguous listed common-stock issuer", () => {
    const sandvik = candidate({
      ticker: "SAND.ST",
      canonicalTicker: "SAND.ST",
      name: "Sandvik AB (publ)",
      issuerId: "issuer:sandvik",
      country: "SE",
    });

    expect(resolveInvestmentCompanyHoldingCandidate("Sandvik", [sandvik])).toEqual(sandvik);
  });

  it("accepts multiple share classes only when stable issuer identity proves they are the same issuer", () => {
    const a = candidate({
      ticker: "VOLV-A.ST",
      name: "AB Volvo (publ)",
      issuerId: "issuer:volvo",
      providerCapabilities: { fundamentals: false, marketData: true, providerIds: ["yahoo"] },
    });
    const b = candidate({
      ticker: "VOLV-B.ST",
      canonicalTicker: "VOLV-B.ST",
      name: "AB Volvo (publ)",
      issuerId: "issuer:volvo",
      analysisCapability: { fundamentals: "full", marketData: "available" },
      providerCapabilities: { fundamentals: true, marketData: true, providerIds: ["yahoo"] },
    });

    expect(resolveInvestmentCompanyHoldingCandidate("Volvo", [a, b])).toEqual(b);
  });

  it("fails closed when matching common-stock candidates belong to different issuers", () => {
    const first = candidate({ ticker: "ERIC-A.ST", name: "LM Ericsson AB", issuerId: "issuer:one" });
    const second = candidate({ ticker: "ERIC-B.ST", name: "Telefonaktiebolaget LM Ericsson (publ)", issuerId: "issuer:two" });

    expect(resolveInvestmentCompanyHoldingCandidate("Ericsson", [first, second])).toBeNull();
  });

  it("rejects ADR, fund and preferred candidates instead of treating them as the underlying holding", () => {
    const candidates: CompanySearchResult[] = [
      candidate({ ticker: "SANDY", name: "Sandvik AB ADR", securityType: "ADR" }),
      candidate({ ticker: "SAND-FUND", name: "Sandvik Fund", securityType: "ETF/Fund" }),
      candidate({ ticker: "SAND-P", name: "Sandvik Preferred", securityType: "Preferred" }),
    ];

    expect(resolveInvestmentCompanyHoldingCandidate("Sandvik", candidates)).toBeNull();
  });

  it("does not resolve a broad leading-token substring to a different company name", () => {
    const atlasCopco = candidate({
      ticker: "ATCO-A.ST",
      name: "Atlas Copco AB",
      issuerId: "issuer:atlas-copco",
    });

    expect(resolveInvestmentCompanyHoldingCandidate("Atlas", [atlasCopco])).toBeNull();
  });

  it("supports official short brands that are the final meaningful token in the legal company name", () => {
    const handelsbanken = candidate({
      ticker: "SHB-A.ST",
      name: "Svenska Handelsbanken AB (publ)",
      issuerId: "issuer:shb",
    });
    const ericsson = candidate({
      ticker: "ERIC-B.ST",
      name: "Telefonaktiebolaget LM Ericsson (publ)",
      issuerId: "issuer:ericsson",
    });
    const sca = candidate({
      ticker: "SCA-B.ST",
      name: "Svenska Cellulosa Aktiebolaget SCA (publ)",
      issuerId: "issuer:sca",
    });

    expect(resolveInvestmentCompanyHoldingCandidate("Handelsbanken", [handelsbanken])?.ticker).toBe("SHB-A.ST");
    expect(resolveInvestmentCompanyHoldingCandidate("Ericsson", [ericsson])?.ticker).toBe("ERIC-B.ST");
    expect(resolveInvestmentCompanyHoldingCandidate("SCA", [sca])?.ticker).toBe("SCA-B.ST");
  });
});
