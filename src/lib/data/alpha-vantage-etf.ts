import type { EtfAnalysisInput, EtfHolding } from "@/lib/analysis/universal-security";
import type { AnalysisSource, CompanySearchResult, ProviderDiagnostic } from "@/lib/analysis/types";

const PROVIDER_ID = "alpha-vantage-etf";
const REQUEST_TIMEOUT_MS = 10_000;

type JsonObject = Record<string, unknown>;

export type AlphaVantageEtfData = {
  input: EtfAnalysisInput;
  source: AnalysisSource;
  diagnostic: ProviderDiagnostic;
};

export type AlphaVantageEtfResult =
  | { ok: true; data: AlphaVantageEtfData }
  | { ok: false; message: string; diagnostic: ProviderDiagnostic };

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/,/g, "");
  if (!normalized || /^n\/?a$/i.test(normalized) || /^none$/i.test(normalized)) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

// Alpha Vantage ETF_PROFILE percentage fields are expressed in percentage points
// (e.g. 1.25 means 1.25%, 31.5 means 31.5%). StockBox stores ratios as fractions.
function percentFraction(value: unknown): number | null {
  const parsed = numberValue(value);
  return parsed === null ? null : parsed / 100;
}

function diagnostic(status: ProviderDiagnostic["status"], reason?: string): ProviderDiagnostic {
  return {
    provider: "Alpha Vantage ETF profile",
    capability: "specialized",
    status,
    reason,
    observedAt: new Date().toISOString(),
  };
}

function hhi(weights: number[]): number | null {
  const valid = weights.filter((weight) => Number.isFinite(weight) && weight > 0);
  const total = valid.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return null;
  return valid.reduce((sum, weight) => sum + (weight / total) ** 2, 0);
}

function parseHoldings(payload: JsonObject): EtfHolding[] {
  const rows = Array.isArray(payload.holdings) ? payload.holdings : [];
  return rows.flatMap((value) => {
    const row = object(value);
    if (!row) return [];
    const weight = percentFraction(row.weight);
    const symbol = stringValue(row.symbol);
    const name = stringValue(row.description) ?? symbol;
    if (!name || weight === null || weight <= 0) return [];
    return [{ ticker: symbol ?? undefined, name, weight }];
  });
}

function parseSectorHhi(payload: JsonObject): number | null {
  const rows = Array.isArray(payload.sectors) ? payload.sectors : [];
  const weights = rows.flatMap((value) => {
    const row = object(value);
    if (!row) return [];
    const weight = percentFraction(row.weight);
    return weight !== null && weight >= 0 ? [weight] : [];
  });
  return hhi(weights);
}

function fundAgeYears(inceptionDate: string | null): number | null {
  if (!inceptionDate) return null;
  const timestamp = Date.parse(inceptionDate);
  if (!Number.isFinite(timestamp)) return null;
  const years = (Date.now() - timestamp) / (365.2425 * 86_400_000);
  return Number.isFinite(years) && years >= 0 ? years : null;
}

function concentration(holdings: EtfHolding[]) {
  const weights = holdings.map((holding) => holding.weight).sort((a, b) => b - a);
  return {
    numberOfHoldings: holdings.length || null,
    top10Weight: weights.length ? weights.slice(0, 10).reduce((sum, weight) => sum + weight, 0) : null,
    largestHoldingWeight: weights[0] ?? null,
    holdingsHhi: hhi(weights),
  };
}

function symbolForAlphaVantage(company: CompanySearchResult): string {
  const ticker = (company.canonicalTicker ?? company.ticker).trim().toUpperCase();
  // Yahoo-style US tickers are already compatible. International symbol conventions differ
  // between providers, so this fallback fails closed rather than inventing exchange mappings.
  return ticker;
}

export function parseAlphaVantageEtfProfile(payload: unknown, company: CompanySearchResult): EtfAnalysisInput | null {
  const root = object(payload);
  if (!root) return null;
  if (root["Error Message"] || root.Note || root.Information) return null;

  const holdings = parseHoldings(root);
  const holdingsConcentration = concentration(holdings);
  const inceptionDate = stringValue(root.inception_date);
  const leveraged = stringValue(root.leveraged)?.toUpperCase() === "YES";

  const input: EtfAnalysisInput = {
    expenseRatio: percentFraction(root.net_expense_ratio),
    turnover: percentFraction(root.portfolio_turnover),
    distributionYield: percentFraction(root.dividend_yield),
    assetsUnderManagement: numberValue(root.net_assets),
    fundAgeYears: fundAgeYears(inceptionDate),
    numberOfHoldings: holdingsConcentration.numberOfHoldings,
    top10Weight: holdingsConcentration.top10Weight,
    largestHoldingWeight: holdingsConcentration.largestHoldingWeight,
    holdingsHhi: holdingsConcentration.holdingsHhi,
    sectorHhi: parseSectorHhi(root),
    leverageFactor: leveraged ? null : undefined,
    holdings,
  };

  const hasData = Object.values(input).some((value) => value !== null && value !== undefined && (!Array.isArray(value) || value.length > 0));
  void company;
  return hasData ? input : null;
}

export async function fetchAlphaVantageEtfData(
  company: CompanySearchResult,
  apiKey: string | null | undefined,
): Promise<AlphaVantageEtfResult> {
  const key = apiKey?.trim();
  if (!key) {
    return {
      ok: false,
      message: "Alpha Vantage ETF fallback is not configured.",
      diagnostic: diagnostic("unavailable", "alpha_vantage_api_key_missing"),
    };
  }

  const symbol = symbolForAlphaVantage(company);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = new URL("https://www.alphavantage.co/query");
    url.searchParams.set("function", "ETF_PROFILE");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("apikey", key);
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "StockBox/2.0" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        message: `Alpha Vantage ETF profile returned HTTP ${response.status}.`,
        diagnostic: diagnostic("unavailable", `http_${response.status}`),
      };
    }
    const payload = await response.json().catch(() => null);
    const root = object(payload);
    if (root?.Note || root?.Information) {
      return {
        ok: false,
        message: "Alpha Vantage ETF profile is rate-limited or unavailable for this key.",
        diagnostic: diagnostic("rate_limited", "provider_rate_limit_or_information_response"),
      };
    }
    const input = parseAlphaVantageEtfProfile(payload, company);
    if (!input) {
      return {
        ok: false,
        message: "Alpha Vantage did not return a usable ETF profile for this symbol.",
        diagnostic: diagnostic("unavailable", root?.["Error Message"] ? "provider_error" : "etf_profile_empty"),
      };
    }
    const accessedAt = new Date().toISOString();
    return {
      ok: true,
      data: {
        input,
        source: {
          name: "Alpha Vantage ETF Profile & Holdings",
          url: `https://www.alphavantage.co/query?function=ETF_PROFILE&symbol=${encodeURIComponent(symbol)}`,
          accessedAt,
          freshness: "ETF profile, holdings, sector allocation and fund metadata are fetched from Alpha Vantage when the optional fallback is configured.",
          provider: PROVIDER_ID,
          capability: "specialized",
          dataAsOf: null,
          version: "alpha-vantage-etf-v1",
        },
        diagnostic: diagnostic("available"),
      },
    };
  } catch {
    return {
      ok: false,
      message: "Alpha Vantage ETF profile request failed.",
      diagnostic: diagnostic("unavailable", "request_failed"),
    };
  } finally {
    clearTimeout(timeout);
  }
}
