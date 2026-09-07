import JSZip from "jszip";
import type {
  AnalysisSource,
  CompanyFundamentals,
  CompanySearchResult,
  FinancialPeriod,
  ProviderDiagnostic,
} from "@/lib/analysis/types";
import {
  deriveCvmTotalDebt,
  normalizeBrazilTradingTicker,
  resolveCvmIssuerFromFcaRows,
  supplementFundamentalsWithCvmDebt,
  type CvmCsvRow,
} from "./cvm-brazil-fundamentals";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type DatasetCacheEntry = {
  expiresAt: number;
  promise: Promise<CvmCsvRow[]>;
};

const CVM_PROVIDER_NAME = "CVM ITR";
const CVM_PROVIDER_ID = "cvm-brazil-itr";
const DATASET_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
const datasetCache = new Map<string, DatasetCacheEntry>();

export type CvmBrazilProviderOptions = {
  fetchImpl?: FetchLike;
  useCache?: boolean;
  now?: () => number;
};

export type CvmBrazilDebtEnrichment = {
  fundamentals: CompanyFundamentals;
  supplemented: boolean;
  diagnostic: ProviderDiagnostic | null;
  source?: Omit<AnalysisSource, "accessedAt">;
};

function diagnostic(
  status: ProviderDiagnostic["status"],
  reason: string,
): ProviderDiagnostic {
  return {
    provider: CVM_PROVIDER_NAME,
    capability: "fundamentals",
    status,
    reason,
    observedAt: new Date().toISOString(),
  };
}

function cvmFcaUrl(year: string): string {
  return `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/FCA/DADOS/fca_cia_aberta_${year}.zip`;
}

function cvmItrUrl(year: string): string {
  return `https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC/ITR/DADOS/itr_cia_aberta_${year}.zip`;
}

function parseDelimitedLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (character === ";" && !quoted) {
      fields.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  fields.push(current);
  return fields;
}

function parseCsv(text: string): CvmCsvRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const headers = parseDelimitedLine(lines[0]).map((header) => header.replace(/^\uFEFF/, ""));
  if (headers.length === 0 || headers.some((header) => !header)) {
    throw new Error("CVM CSV has invalid headers");
  }
  return lines.slice(1).map((line) => {
    const values = parseDelimitedLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

async function fetchZipCsvRows(
  url: string,
  fileMatcher: RegExp,
  fetchImpl: FetchLike,
): Promise<CvmCsvRow[]> {
  const response = await fetchImpl(url, {
    cache: "no-store",
    headers: {
      accept: "application/zip, application/octet-stream;q=0.9",
      "user-agent": "StockBox/1.0 https://www.getstockbox.app/contact",
    },
  });
  if (!response.ok) {
    throw new Error(`CVM request failed with HTTP ${response.status}`);
  }

  const archive = await JSZip.loadAsync(await response.arrayBuffer());
  const fileName = Object.keys(archive.files).find((name) => fileMatcher.test(name));
  if (!fileName) throw new Error("Expected CVM CSV was not found in archive");
  const bytes = await archive.file(fileName)?.async("uint8array");
  if (!bytes) throw new Error("Expected CVM CSV could not be read");
  return parseCsv(new TextDecoder("latin1").decode(bytes));
}

async function loadDatasetRows(
  key: string,
  loader: () => Promise<CvmCsvRow[]>,
  options: Pick<CvmBrazilProviderOptions, "useCache" | "now">,
): Promise<CvmCsvRow[]> {
  const useCache = options.useCache ?? true;
  if (!useCache) return loader();

  const now = options.now?.() ?? Date.now();
  const cached = datasetCache.get(key);
  if (cached && cached.expiresAt > now) return cached.promise;

  const promise = loader();
  datasetCache.set(key, {
    expiresAt: now + DATASET_CACHE_TTL_MS,
    promise,
  });
  try {
    return await promise;
  } catch (error) {
    if (datasetCache.get(key)?.promise === promise) datasetCache.delete(key);
    throw error;
  }
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isMissingBrlDebtPeriod(period: FinancialPeriod | null | undefined): period is FinancialPeriod {
  return Boolean(
    period?.periodEndDate
    && !finite(period.totalDebt)
    && period.currency?.trim().toUpperCase() === "BRL",
  );
}

function targetMissingDebtPeriod(fundamentals: CompanyFundamentals) {
  const trailing = fundamentals.trailingTwelveMonths;
  if (isMissingBrlDebtPeriod(trailing)) return trailing;

  const annual = [...(fundamentals.annualPeriods ?? [])]
    .filter(isMissingBrlDebtPeriod)
    .sort((left, right) => (left.periodEndDate ?? "").localeCompare(right.periodEndDate ?? ""))
    .at(-1);
  return annual ?? null;
}

function missingDebtPeriodEnds(fundamentals: CompanyFundamentals): string[] {
  const periods = [
    fundamentals.trailingTwelveMonths,
    ...(fundamentals.annualPeriods ?? []),
    fundamentals.priorTrailingTwelveMonths,
  ].filter(isMissingBrlDebtPeriod);

  return [...new Set(periods.flatMap((period) => period.periodEndDate ? [period.periodEndDate] : []))];
}

export function resetCvmBrazilDatasetCacheForTests(): void {
  datasetCache.clear();
}

export async function enrichBrazilFundamentalsWithCvmDebt(
  company: CompanySearchResult,
  fundamentals: CompanyFundamentals,
  options: CvmBrazilProviderOptions = {},
): Promise<CvmBrazilDebtEnrichment> {
  const ticker = normalizeBrazilTradingTicker(company);
  const targetPeriod = targetMissingDebtPeriod(fundamentals);
  if (!ticker || !targetPeriod) {
    return {
      fundamentals,
      supplemented: false,
      diagnostic: null,
    };
  }

  const targetPeriodEnd = targetPeriod.periodEndDate;
  if (!targetPeriodEnd) {
    return {
      fundamentals,
      supplemented: false,
      diagnostic: diagnostic("partial", "invalid_target_period"),
    };
  }
  const year = /^\d{4}-\d{2}-\d{2}$/.test(targetPeriodEnd)
    ? targetPeriodEnd.slice(0, 4)
    : null;
  if (!year) {
    return {
      fundamentals,
      supplemented: false,
      diagnostic: diagnostic("partial", "invalid_target_period"),
    };
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const fcaUrl = cvmFcaUrl(year);
  const itrUrl = cvmItrUrl(year);

  try {
    const fcaRows = await loadDatasetRows(
      `FCA:${year}`,
      () => fetchZipCsvRows(
        fcaUrl,
        new RegExp(`fca_cia_aberta_valor_mobiliario_${year}\\.csv$`, "i"),
        fetchImpl,
      ),
      options,
    );
    const issuer = resolveCvmIssuerFromFcaRows(fcaRows, ticker);
    if (!issuer) {
      return {
        fundamentals,
        supplemented: false,
        diagnostic: diagnostic("unavailable", "issuer_mapping_not_found"),
      };
    }

    const itrRows = await loadDatasetRows(
      `ITR:BPP_CON:${year}`,
      () => fetchZipCsvRows(
        itrUrl,
        new RegExp(`itr_cia_aberta_BPP_con_${year}\\.csv$`, "i"),
        fetchImpl,
      ),
      options,
    );
    const observation = deriveCvmTotalDebt(itrRows, issuer);
    if (!observation) {
      return {
        fundamentals,
        supplemented: false,
        diagnostic: diagnostic("partial", "debt_observation_unavailable"),
      };
    }
    if (observation.periodEnd !== targetPeriodEnd) {
      return {
        fundamentals,
        supplemented: false,
        diagnostic: diagnostic("partial", "period_mismatch"),
      };
    }

    let supplementedFundamentals = supplementFundamentalsWithCvmDebt(
      company,
      fundamentals,
      observation,
    );
    for (const periodEnd of missingDebtPeriodEnds(fundamentals)) {
      if (periodEnd === observation.periodEnd) continue;
      const comparativeObservation = deriveCvmTotalDebt(itrRows, issuer, periodEnd);
      if (!comparativeObservation) continue;
      supplementedFundamentals = supplementFundamentalsWithCvmDebt(
        company,
        supplementedFundamentals,
        comparativeObservation,
      );
    }

    if (supplementedFundamentals === fundamentals) {
      return {
        fundamentals,
        supplemented: false,
        diagnostic: diagnostic("partial", "supplement_not_applied"),
      };
    }

    return {
      fundamentals: supplementedFundamentals,
      supplemented: true,
      diagnostic: diagnostic("available", "supplemented_missing_total_debt"),
      source: {
        name: "CVM ITR reported fundamentals",
        url: itrUrl,
        freshness: "Official CVM ITR open dataset, updated on the regulator publication schedule.",
        provider: CVM_PROVIDER_ID,
        capability: "fundamentals",
        dataAsOf: observation.periodEnd,
      },
    };
  } catch {
    return {
      fundamentals,
      supplemented: false,
      diagnostic: diagnostic("unavailable", "upstream_error"),
    };
  }
}
