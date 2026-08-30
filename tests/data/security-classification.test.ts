import { describe, expect, it } from "vitest";
import { canAttemptConfiguredFundamentals, inferSecurityType } from "../../src/lib/data/security-classification";
import type { CompanySearchResult } from "../../src/lib/analysis/types";

function company(overrides: Partial<CompanySearchResult> = {}): CompanySearchResult {
  return {
    ticker: "VOLV-B.ST",
    canonicalTicker: "VOLV-B.ST",
    name: "Volvo AB Class B",
    country: "SE",
    securityType: "Common Stock",
    providerCapabilities: { fundamentals: false, marketData: true, providerIds: ["security-master"] },
    ...overrides,
  };
}

describe("configured fundamentals eligibility", () => {
  it("allows a common stock even when its discovery provider has no fundamentals", () => {
    expect(canAttemptConfiguredFundamentals(company())).toBe(true);
  });

  it.each([
    ["Preferred", { ticker: "ACME-PB", canonicalTicker: "ACME-PB", name: "Acme Preferred Series B", securityType: "Preferred" }],
    ["ETF/Fund", { ticker: "SPY", canonicalTicker: "SPY", name: "State Street SPDR S&P 500 ETF Trust", securityType: "ETF/Fund" }],
    ["ADR", { ticker: "BABA", canonicalTicker: "BABA", name: "Alibaba ADR", securityType: "ADR" }],
    ["Other", { ticker: "ROP.SW", canonicalTicker: "ROP.SW", name: "Roche Holding AG", securityType: "Other" }],
  ] as const)("blocks unsupported %s securities", (_label, overrides) => {
    expect(canAttemptConfiguredFundamentals(company(overrides))).toBe(false);
  });
});

describe("fund and trust security text inference", () => {
  it.each([
    "Royce Micro-Cap Trust, Inc.",
    "BlackRock Multi-Sector Income Trust",
    "Eaton Vance Municipal Income 2028 Term Trust",
    "Blackrock Municipal 2030 Target Term Trust",
    "The Gabelli Utility Trust",
    "The Gabelli Healthcare & Wellness Trust",
  ])("recognizes closed-end trust-style funds as fund securities: %s", (name) => {
    expect(inferSecurityType(company({ ticker: "CEF", canonicalTicker: "CEF", name, securityType: "Common Stock" }))).toBe("ETF/Fund");
  });

  it.each([
    "Hamlin Bank and Trust Company",
    "Federal Realty Investment Trust",
    "Healthcare Realty Trust Incorporated",
    "Digital Realty Trust, Inc.",
    "Equity Residential",
  ])("does not confuse operating trust wording with fund securities: %s", (name) => {
    expect(inferSecurityType(company({ ticker: "TRST", canonicalTicker: "TRST", name, securityType: "Common Stock" }))).toBe("Common Stock");
  });

  it.each([
    ["DNBO.ST", "DNB Bank ASA"],
    ["FROO.ST", "Frontline plc"],
    ["BWEO.ST", "BW Energy Limited"],
    ["MEDIO.ST", "Medistim ASA"],
    ["IOXO.ST", "Interoil Exploration and Production ASA"],
  ])("corrects provider fund labels for operating-company listings: %s", (ticker, name) => {
    expect(inferSecurityType(company({ ticker, canonicalTicker: ticker, name, securityType: "ETF/Fund" }))).toBe("Common Stock");
  });

  it.each([
    ["IUSA.L", "iShares VII PLC - S&P 500 UCITS ETF"],
    ["PDI", "PIMCO Dynamic Income Fund"],
    ["SPY", "State Street SPDR S&P 500 ETF Trust"],
  ])("keeps fund-product names classified as fund securities: %s", (ticker, name) => {
    expect(inferSecurityType(company({ ticker, canonicalTicker: ticker, name, securityType: "ETF/Fund" }))).toBe("ETF/Fund");
  });
});


describe("preferred-security text inference", () => {
  it.each([
    ["MC.PA", "LVMH Moët Hennessy - Louis Vuitton, Société Européenne"],
    ["BNP.PA", "BNP Paribas SA"],
    ["ISP.MI", "Intesa Sanpaolo S.p.A."],
    ["MAERSK-B.CO", "A.P. Møller - Mærsk A/S"],
  ])("does not confuse exchange/legal-form punctuation with preferred stock: %s", (ticker, name) => {
    expect(inferSecurityType(company({ ticker, canonicalTicker: ticker, name, securityType: "Common Stock" }))).toBe("Common Stock");
  });

  it("still recognizes explicit preferred-stock wording", () => {
    expect(inferSecurityType(company({ ticker: "ACME-PB", canonicalTicker: "ACME-PB", name: "Acme 5% Preferred Series B", securityType: "Common Stock" }))).toBe("Preferred");
  });

  it("recognizes Brazilian preferred share class tickers without misclassifying ordinary class 3", () => {
    expect(inferSecurityType(company({ ticker: "PETR4.SA", canonicalTicker: "PETR4.SA", name: "Petrobras", securityType: "Common Stock" }))).toBe("Preferred");
    expect(inferSecurityType(company({ ticker: "VALE3.SA", canonicalTicker: "VALE3.SA", name: "Vale S.A.", securityType: "Common Stock" }))).toBe("Common Stock");
  });

  it("treats Roche participation certificates as a non-common security", () => {
    expect(inferSecurityType(company({
      ticker: "ROP.SW", canonicalTicker: "ROP.SW", name: "Roche Holding AG", securityType: "Common Stock",
    }))).toBe("Other");
  });

  it.each(["FEMSAUBD.MX", "FEMSAUB.MX", "CEMEXCPO.MX"])("treats Mexican composite units/certificates as non-common securities: %s", (ticker) => {
    expect(inferSecurityType(company({ ticker, canonicalTicker: ticker, name: "Mexican listed issuer", securityType: "Common Stock" }))).toBe("Other");
  });

  it.each(["HEN3.DE", "BMW3.DE", "VOW3.DE", "PAH3.DE"])("recognizes the Xetra preference-share class-3 convention: %s", (ticker) => {
    expect(inferSecurityType(company({ ticker, canonicalTicker: ticker, name: "German listed issuer", securityType: "Common Stock" }))).toBe("Preferred");
  });

  it.each(["HEN.DE", "BMW.DE", "VOW.DE"])("does not relabel the corresponding German ordinary share: %s", (ticker) => {
    expect(inferSecurityType(company({ ticker, canonicalTicker: ticker, name: "German listed issuer", securityType: "Common Stock" }))).toBe("Common Stock");
  });
});
