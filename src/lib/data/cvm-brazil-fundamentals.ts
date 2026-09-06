import type { CompanyFundamentals, CompanySearchResult, MetricProvenance } from "@/lib/analysis/types";

export type CvmCsvRow = Record<string, string>;

export type CvmIssuerIdentity = {
  ticker: string;
  cnpj: string;
  cvmCode: string | null;
};

export type CvmDebtObservation = {
  totalDebt: number;
  currency: "BRL";
  periodEnd: string;
  provenance: MetricProvenance;
};

export function normalizeBrazilTradingTicker(
  _company: Pick<CompanySearchResult, "ticker" | "canonicalTicker" | "localTicker" | "country" | "exchange" | "mic">,
): string | null {
  return null;
}

export function resolveCvmIssuerFromFcaRows(
  _rows: CvmCsvRow[],
  _ticker: string,
): CvmIssuerIdentity | null {
  return null;
}

export function deriveCvmTotalDebt(
  _rows: CvmCsvRow[],
  _issuer: CvmIssuerIdentity,
): CvmDebtObservation | null {
  return null;
}

export function supplementFundamentalsWithCvmDebt(
  _company: CompanySearchResult,
  fundamentals: CompanyFundamentals,
  _observation: CvmDebtObservation | null,
): CompanyFundamentals {
  return fundamentals;
}
