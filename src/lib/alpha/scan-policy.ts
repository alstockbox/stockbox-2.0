export type ScannerCandidate = {
  id: string;
  ticker: string;
  lastPredictionAt: string | null;
};

export type ScannerPolicy = {
  now: string;
  maxBatch: number;
  refreshAfterHours: number;
};

const HARD_MAX_BATCH = 50;

function timestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function selectScannerCandidates<T extends ScannerCandidate>(
  candidates: T[],
  policy: ScannerPolicy,
): T[] {
  const now = Date.parse(policy.now);
  if (!Number.isFinite(now)) throw new Error("Scanner policy requires a valid current timestamp.");
  const refreshMs = Math.max(1, policy.refreshAfterHours) * 60 * 60 * 1000;
  const limit = Math.min(HARD_MAX_BATCH, Math.max(1, Math.floor(policy.maxBatch)));

  return candidates
    .filter((candidate) => {
      const last = timestamp(candidate.lastPredictionAt);
      return last === null || now - last >= refreshMs;
    })
    .sort((left, right) => {
      const leftTime = timestamp(left.lastPredictionAt);
      const rightTime = timestamp(right.lastPredictionAt);
      if (leftTime === null && rightTime !== null) return -1;
      if (leftTime !== null && rightTime === null) return 1;
      if (leftTime === null && rightTime === null) return left.ticker.localeCompare(right.ticker);
      if (leftTime !== rightTime) return (leftTime ?? 0) - (rightTime ?? 0);
      return left.ticker.localeCompare(right.ticker);
    })
    .slice(0, limit);
}

export const ALPHA_SCANNER_HARD_MAX_BATCH = HARD_MAX_BATCH;
