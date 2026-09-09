import {
  classifyUniversalSecurity,
  type EtfAnalysisInput,
} from "@/lib/analysis/universal-security";
import type { AnalysisSource, CompanySearchResult, ProviderDiagnostic } from "@/lib/analysis/types";
import {
  fetchAlphaVantageEtfData,
  type AlphaVantageEtfResult,
} from "./alpha-vantage-etf";
import { summarizeEtfHoldingConcentration } from "./etf-holdings-math";
import { mergeEtfAnalysisInputs } from "./etf-input-merge";
import { fetchYahooEtfData, type YahooEtfResult } from "./yahoo-etf";

const ALPHA_ENRICHABLE_FIELDS: Array<keyof EtfAnalysisInput> = [
  "expenseRatio",
  "turnover",
  "distributionYield",
  "assetsUnderManagement",
  "fundAgeYears",
  "numberOfHoldings",
  "top10Weight",
  "largestHoldingWeight",
  "holdingsHhi",
  "sectorHhi",
];

const ETF_SUBTYPES = new Set<NonNullable<EtfAnalysisInput["subtype"]>>([
  "equity_etf",
  "index_etf",
  "sector_etf",
  "factor_etf",
  "bond_etf",
  "commodity_etf",
  "leveraged_inverse_etf",
]);

type EtfProviderFetchers = {
  yahoo: (company: CompanySearchResult) => Promise<YahooEtfResult>;
  alphaVantage: (company: CompanySearchResult, apiKey: string | null | undefined) => Promise<AlphaVantageEtfResult>;
};

export type EtfProviderChainData = {
  input: EtfAnalysisInput;
  category: string | null;
  fundFamily: string | null;
  quoteType: string | null;
  sources: AnalysisSource[];
  diagnostics: ProviderDiagnostic[];
  warnings: string[];
  fallbackFields: Array<keyof EtfAnalysisInput>;
};

export type EtfProviderChainResult =
  | { ok: true; data: EtfProviderChainData }
  | {
      ok: false;
      message: string;
      warnings: string[];
      diagnostics: ProviderDiagnostic[];
    };

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return true;
}

function yahooHasAlphaEnrichmentGap(input: EtfAnalysisInput): boolean {
  if (ALPHA_ENRICHABLE_FIELDS.some((field) => !hasValue(input[field]))) return true;
  const holdings = input.holdings ?? [];
  if (!holdings.length) return true;
  return summarizeEtfHoldingConcentration(holdings).representedWeight < 0.95;
}

function alphaKey(apiKey: string | null | undefined): string | null {
  const key = apiKey?.trim();
  return key ? key : null;
}

function resolveEtfSubtype(
  company: CompanySearchResult,
  input: EtfAnalysisInput,
  category: string | null = null,
  quoteType: string | null = null,
): NonNullable<EtfAnalysisInput["subtype"]> {
  if (input.subtype && ETF_SUBTYPES.has(input.subtype)) return input.subtype;
  const kind = classifyUniversalSecurity({ company, category, quoteType }).kind;
  return ETF_SUBTYPES.has(kind as NonNullable<EtfAnalysisInput["subtype"]>)
    ? kind as NonNullable<EtfAnalysisInput["subtype"]>
    : "equity_etf";
}

function withResolvedSubtype(
  company: CompanySearchResult,
  input: EtfAnalysisInput,
  category: string | null = null,
  quoteType: string | null = null,
): EtfAnalysisInput {
  return {
    ...input,
    subtype: resolveEtfSubtype(company, input, category, quoteType),
  };
}

export async function fetchEtfProviderChain(
  company: CompanySearchResult,
  apiKey: string | null | undefined,
  fetchers: Partial<EtfProviderFetchers> = {},
): Promise<EtfProviderChainResult> {
  const yahoo = fetchers.yahoo ?? fetchYahooEtfData;
  const alphaVantage = fetchers.alphaVantage ?? fetchAlphaVantageEtfData;
  const configuredAlphaKey = alphaKey(apiKey);
  const yahooResult = await yahoo(company);

  if (yahooResult.ok) {
    const primary = yahooResult.data;
    const primaryInput = withResolvedSubtype(company, primary.input, primary.category, primary.quoteType);
    const diagnostics: ProviderDiagnostic[] = [primary.diagnostic];

    if (!configuredAlphaKey || !yahooHasAlphaEnrichmentGap(primaryInput)) {
      return {
        ok: true,
        data: {
          input: primaryInput,
          category: primary.category,
          fundFamily: primary.fundFamily,
          quoteType: primary.quoteType,
          sources: [primary.source],
          diagnostics,
          warnings: [],
          fallbackFields: [],
        },
      };
    }

    const alphaResult = await alphaVantage(company, configuredAlphaKey);
    diagnostics.push(alphaResult.ok ? alphaResult.data.diagnostic : alphaResult.diagnostic);
    if (!alphaResult.ok) {
      return {
        ok: true,
        data: {
          input: primaryInput,
          category: primary.category,
          fundFamily: primary.fundFamily,
          quoteType: primary.quoteType,
          sources: [primary.source],
          diagnostics,
          warnings: [],
          fallbackFields: [],
        },
      };
    }

    const merged = mergeEtfAnalysisInputs(primaryInput, alphaResult.data.input);
    const alphaContributed = merged.fallbackFields.length > 0;
    return {
      ok: true,
      data: {
        input: withResolvedSubtype(company, merged.input, primary.category, primary.quoteType),
        category: primary.category,
        fundFamily: primary.fundFamily,
        quoteType: primary.quoteType,
        sources: alphaContributed ? [primary.source, alphaResult.data.source] : [primary.source],
        diagnostics,
        warnings: [],
        fallbackFields: merged.fallbackFields,
      },
    };
  }

  const diagnostics: ProviderDiagnostic[] = [yahooResult.diagnostic];
  const warnings = [yahooResult.message];
  if (!configuredAlphaKey) {
    return {
      ok: false,
      message: "ETF-specific metadata is unavailable from the configured specialist providers.",
      warnings,
      diagnostics,
    };
  }

  const alphaResult = await alphaVantage(company, configuredAlphaKey);
  diagnostics.push(alphaResult.ok ? alphaResult.data.diagnostic : alphaResult.diagnostic);
  if (!alphaResult.ok) {
    return {
      ok: false,
      message: "ETF-specific metadata is unavailable from the configured specialist providers.",
      warnings: [...warnings, alphaResult.message],
      diagnostics,
    };
  }

  return {
    ok: true,
    data: {
      input: withResolvedSubtype(company, alphaResult.data.input),
      category: null,
      fundFamily: null,
      quoteType: null,
      sources: [alphaResult.data.source],
      diagnostics,
      warnings,
      fallbackFields: [],
    },
  };
}
