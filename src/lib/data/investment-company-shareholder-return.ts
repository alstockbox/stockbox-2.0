const DAY_MS = 24 * 60 * 60 * 1000;
const SHAREHOLDER_RETURN_CURRENT_MAX_AGE_DAYS = 45;
const SHAREHOLDER_RETURN_ANCHOR_TOLERANCE_DAYS = 60;

export type AdjustedPriceObservation = {
  date: string;
  adjustedClose: number;
};

export type InvestmentCompanyShareholderReturns = {
  shareholderReturn3yCagr: number | null;
  shareholderReturn5yCagr: number | null;
};

type ValidObservation = AdjustedPriceObservation & {
  timestamp: number;
};

function parseIsoDay(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);

  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return timestamp;
}

function validObservations(observations: AdjustedPriceObservation[] | null | undefined): ValidObservation[] {
  return (observations ?? []).flatMap((observation) => {
    const timestamp = parseIsoDay(observation.date);
    if (
      timestamp === null
      || !Number.isFinite(observation.adjustedClose)
      || observation.adjustedClose <= 0
    ) {
      return [];
    }
    return [{ ...observation, timestamp }];
  });
}

function anniversaryTimestamp(referenceTimestamp: number, years: number): number {
  const reference = new Date(referenceTimestamp);
  const year = reference.getUTCFullYear() - years;
  const month = reference.getUTCMonth();
  const day = reference.getUTCDate();
  const candidate = Date.UTC(year, month, day);
  const parsed = new Date(candidate);
  if (parsed.getUTCMonth() === month) return candidate;
  return Date.UTC(year, month + 1, 0);
}

function currentObservation(
  observations: ValidObservation[],
  marketTimestamp: number,
): ValidObservation | null {
  const maxAgeMs = SHAREHOLDER_RETURN_CURRENT_MAX_AGE_DAYS * DAY_MS;
  return observations
    .filter((observation) => (
      observation.timestamp <= marketTimestamp
      && marketTimestamp - observation.timestamp <= maxAgeMs
    ))
    .sort((left, right) => right.timestamp - left.timestamp)[0] ?? null;
}

function nearestAnchor(
  observations: ValidObservation[],
  current: ValidObservation,
  years: 3 | 5,
): ValidObservation | null {
  const target = anniversaryTimestamp(current.timestamp, years);
  const toleranceMs = SHAREHOLDER_RETURN_ANCHOR_TOLERANCE_DAYS * DAY_MS;
  return observations
    .filter((observation) => (
      observation.timestamp < current.timestamp
      && Math.abs(observation.timestamp - target) <= toleranceMs
    ))
    .sort((left, right) => {
      const leftDistance = Math.abs(left.timestamp - target);
      const rightDistance = Math.abs(right.timestamp - target);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      return right.timestamp - left.timestamp;
    })[0] ?? null;
}

function cagr(
  current: ValidObservation,
  observations: ValidObservation[],
  years: 3 | 5,
): number | null {
  const anchor = nearestAnchor(observations, current, years);
  if (!anchor) return null;
  const ratio = current.adjustedClose / anchor.adjustedClose;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  const value = ratio ** (1 / years) - 1;
  return Number.isFinite(value) ? value : null;
}

export function deriveInvestmentCompanyShareholderReturns(
  observations: AdjustedPriceObservation[] | null | undefined,
  marketDate: string,
): InvestmentCompanyShareholderReturns {
  const empty: InvestmentCompanyShareholderReturns = {
    shareholderReturn3yCagr: null,
    shareholderReturn5yCagr: null,
  };
  const marketTimestamp = parseIsoDay(marketDate);
  if (marketTimestamp === null) return empty;

  const valid = validObservations(observations);
  const current = currentObservation(valid, marketTimestamp);
  if (!current) return empty;

  return {
    shareholderReturn3yCagr: cagr(current, valid, 3),
    shareholderReturn5yCagr: cagr(current, valid, 5),
  };
}
