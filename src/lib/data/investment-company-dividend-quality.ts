import type { InvestmentCompanyKeyRatioYear } from "@/lib/data/official-investment-company-key-ratios";

const REQUIRED_YEARS = 5;
const DIVIDEND_RECONCILIATION_TOLERANCE = 0.02;
const MIN_FUNDING_BUFFER_FOR_CREDIT = 0.5;
const FULL_FUNDING_BUFFER = 2;

type DividendQualityFailureReason =
  | "insufficient_consecutive_dividend_history"
  | "incomplete_dividend_evidence"
  | "dividend_accounting_reconciliation_failed";

export type InvestmentCompanyDividendQuality = {
  score: number | null;
  yearsUsed: number[];
  fundingBuffer: number | null;
  continuity: number | null;
  reason: DividendQualityFailureReason | null;
};

function emptyResult(
  reason: DividendQualityFailureReason,
  yearsUsed: number[] = [],
): InvestmentCompanyDividendQuality {
  return {
    score: null,
    yearsUsed,
    fundingBuffer: null,
    continuity: null,
    reason,
  };
}

function isCompleteDividendYear(point: InvestmentCompanyKeyRatioYear): boolean {
  return Number.isInteger(point.year)
    && Number.isFinite(point.sharesOutstanding)
    && point.sharesOutstanding > 0
    && Number.isFinite(point.dividendsPaid)
    && point.dividendsPaid >= 0
    && Number.isFinite(point.dividendPerShare)
    && point.dividendPerShare >= 0
    && Number.isFinite(point.dividendsReceived)
    && point.dividendsReceived >= 0;
}

function reconcilesDividendAccounting(point: InvestmentCompanyKeyRatioYear): boolean {
  const expectedPaid = point.sharesOutstanding * point.dividendPerShare;
  if (!Number.isFinite(expectedPaid) || expectedPaid < 0) return false;

  const denominator = Math.max(Math.abs(expectedPaid), Math.abs(point.dividendsPaid), 1);
  return Math.abs(point.dividendsPaid - expectedPaid) / denominator <= DIVIDEND_RECONCILIATION_TOLERANCE;
}

function fundingScore(buffer: number | null): number {
  if (buffer === null || !Number.isFinite(buffer)) return 0;
  if (buffer <= MIN_FUNDING_BUFFER_FOR_CREDIT) return 0;
  if (buffer >= FULL_FUNDING_BUFFER) return 100;

  return ((buffer - MIN_FUNDING_BUFFER_FOR_CREDIT)
    / (FULL_FUNDING_BUFFER - MIN_FUNDING_BUFFER_FOR_CREDIT)) * 100;
}

export function deriveInvestmentCompanyDividendQuality(
  history: InvestmentCompanyKeyRatioYear[] | null | undefined,
): InvestmentCompanyDividendQuality {
  const ordered = [...(history ?? [])]
    .filter((point) => Number.isInteger(point.year))
    .sort((left, right) => right.year - left.year);

  if (ordered.length < REQUIRED_YEARS) {
    return emptyResult("insufficient_consecutive_dividend_history");
  }

  const selected = ordered.slice(0, REQUIRED_YEARS);
  const yearsUsed = selected.map((point) => point.year);
  const uniqueYears = new Set(yearsUsed);
  const consecutive = uniqueYears.size === REQUIRED_YEARS
    && yearsUsed.every((year, index) => index === 0 || year === yearsUsed[index - 1] - 1);

  if (!consecutive) {
    return emptyResult("insufficient_consecutive_dividend_history", yearsUsed);
  }

  if (!selected.every(isCompleteDividendYear)) {
    return emptyResult("incomplete_dividend_evidence", yearsUsed);
  }

  if (!selected.every(reconcilesDividendAccounting)) {
    return emptyResult("dividend_accounting_reconciliation_failed", yearsUsed);
  }

  const totalPaid = selected.reduce((sum, point) => sum + point.dividendsPaid, 0);
  const totalReceived = selected.reduce((sum, point) => sum + point.dividendsReceived, 0);
  const fundingBuffer = totalPaid > 0 ? totalReceived / totalPaid : null;
  const continuity = selected.filter((point) => point.dividendsPaid > 0 && point.dividendPerShare > 0).length / REQUIRED_YEARS;

  const score = Math.max(0, Math.min(100,
    fundingScore(fundingBuffer) * 0.8
    + continuity * 100 * 0.2,
  ));

  return {
    score,
    yearsUsed,
    fundingBuffer,
    continuity,
    reason: null,
  };
}
