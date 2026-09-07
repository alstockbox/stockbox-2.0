import { describe, expect, it } from "vitest";
import type { CompanySearchResult } from "@/lib/analysis/types";
import { resolveMostRelevantCompanySelection } from "@/lib/data/company-resolution";

function company(overrides: Partial<CompanySearchResult>): CompanySearchResult {
  return {
    ticker: "ACME",
    canonicalTicker: "ACME",
    name: "Acme Corporation",
    country: "US",
    exchange: "NASDAQ",
    securityType: "Common Stock",
    primarySecurity: true,
    providerCapabilities: { fundamentals: true, marketData: true, providerIds: ["test"] },
    ...overrides,
  };
}

describe("canonical company relevance resolution", () => {
  it("selects the primary analyzable common stock when multiple exact ticker listings exist", () => {
    const relevant = company({
      securityId: "us-primary",
      entityId: "issuer:acme-us",
    });
    const secondary = company({
      securityId: "secondary-fund",
      entityId: "issuer:acme-fund",
      country: "CA",
      exchange: "TSX",
      securityType: "ETF/Fund",
      primarySecurity: false,
      providerCapabilities: { fundamentals: false, marketData: true, providerIds: ["test"] },
    });

    expect(resolveMostRelevantCompanySelection(
      { ticker: "ACME", canonicalTicker: "ACME", name: "ACME" },
      [secondary, relevant],
    )).toEqual({ ok: true, company: relevant });
  });

  it("prefers an exact canonical ticker over a foreign local/provider alias", () => {
    const usCanonical = company({
      ticker: "META",
      canonicalTicker: "META",
      name: "Meta Platforms, Inc.",
      securityId: "meta-us",
      entityId: "issuer:meta",
    });
    const swedishAlias = company({
      ticker: "META.ST",
      canonicalTicker: "META.ST",
      localTicker: "META",
      providerTickers: ["META", "META.ST"],
      name: "Metacon AB",
      securityId: "metacon-se",
      entityId: "issuer:metacon",
      country: "SE",
      exchange: "Stockholm",
    });

    expect(resolveMostRelevantCompanySelection(
      { ticker: "META", canonicalTicker: "META", name: "META" },
      [swedishAlias, usCanonical],
    )).toEqual({ ok: true, company: usCanonical });
  });

  it("uses coverage, stable identity and primary-security signals as deterministic tie breakers", () => {
    const weak = company({
      securityId: undefined,
      entityId: "issuer:weak",
      primarySecurity: false,
      providerCapabilities: { fundamentals: false, marketData: false, providerIds: ["weak"] },
      name: "Acme Secondary",
    });
    const strong = company({
      securityId: "stable-security-id",
      entityId: "issuer:strong",
      primarySecurity: true,
      providerCapabilities: { fundamentals: true, marketData: true, providerIds: ["strong"] },
      name: "Acme Primary",
    });

    const resolution = resolveMostRelevantCompanySelection(
      { ticker: "ACME", canonicalTicker: "ACME", name: "ACME" },
      [weak, strong],
    );
    expect(resolution).toEqual({ ok: true, company: strong });
  });

  it("still refuses a candidate that conflicts with an explicitly supplied stable identifier", () => {
    const candidate = company({ securityId: "correct-id" });
    expect(resolveMostRelevantCompanySelection(
      { ticker: "ACME", canonicalTicker: "ACME", name: "ACME", securityId: "different-id" },
      [candidate],
    )).toEqual({ ok: false, reason: "identity_mismatch" });
  });
});
