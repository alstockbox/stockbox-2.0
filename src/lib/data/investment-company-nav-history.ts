const DAY_MS = 24 * 60 * 60 * 1000;
const NAV_HISTORY_ANCHOR_TOLERANCE_DAYS = 60;

export type NavPerShareObservation = {
  date: string;
  navPerShare: number;
};

export type AnnualNavPerShareObservation = {
  year: number;
  navPerShare: number;
};

export type InvestmentCompanyNavGrowth = {
  navGrowth1y: number | null;
  navGrowth3yCagr: number | null;
  navGrowth5yCagr: number | null;
};

type ValidObservation = NavPerShareObservation & {
  timestamp: number;
};

function emptyNavGrowth(): InvestmentCompanyNavGrowth {
  return {
    navGrowth1y: null,
    navGrowth3yCagr: null,
    navGrowth5yCagr: null,
  };
}

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

function validObservations(observations: NavPerShareObservation[] | null | undefined): ValidObservation[] {
  return (observations ?? []).flatMap((observation) => {
    const timestamp = parseIsoDay(observation.date);
    if (
      timestamp === null
      || !Number.isFinite(observation.navPerShare)
      || observation.navPerShare <= 0
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

function nearestAnchor(
  observations: ValidObservation[],
  referenceTimestamp: number,
  years: number,
): ValidObservation | null {
  const target = anniversaryTimestamp(referenceTimestamp, years);
  const toleranceMs = NAV_HISTORY_ANCHOR_TOLERANCE_DAYS * DAY_MS;

  const eligible = observations
    .filter((observation) => (
      observation.timestamp < referenceTimestamp
      && Math.abs(observation.timestamp - target) <= toleranceMs
    ))
    .sort((left, right) => {
      const leftDistance = Math.abs(left.timestamp - target);
      const rightDistance = Math.abs(right.timestamp - target);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      return right.timestamp - left.timestamp;
    });

  return eligible[0] ?? null;
}

function periodGrowth(
  current: ValidObservation,
  observations: ValidObservation[],
  years: 1 | 3 | 5,
): number | null {
  const anchor = nearestAnchor(observations, current.timestamp, years);
  if (!anchor) return null;

  const ratio = current.navPerShare / anchor.navPerShare;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  if (years === 1) return ratio - 1;

  const cagr = ratio ** (1 / years) - 1;
  return Number.isFinite(cagr) ? cagr : null;
}

function annualPeriodGrowth(
  current: AnnualNavPerShareObservation,
  observations: Map<number, AnnualNavPerShareObservation>,
  years: 1 | 3 | 5,
): number | null {
  const anchor = observations.get(current.year - years);
  if (!anchor) return null;

  const ratio = current.navPerShare / anchor.navPerShare;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  if (years === 1) return ratio - 1;

  const cagr = ratio ** (1 / years) - 1;
  return Number.isFinite(cagr) ? cagr : null;
}

export function deriveInvestmentCompanyNavGrowth(
  observations: NavPerShareObservation[] | null | undefined,
  referenceDate: string,
): InvestmentCompanyNavGrowth {
  const empty = emptyNavGrowth();

  const referenceTimestamp = parseIsoDay(referenceDate);
  if (referenceTimestamp === null) return empty;

  const valid = validObservations(observations);
  const current = valid.find((observation) => (
    observation.timestamp === referenceTimestamp
    && observation.date === referenceDate
  ));
  if (!current) return empty;

  return {
    navGrowth1y: periodGrowth(current, valid, 1),
    navGrowth3yCagr: periodGrowth(current, valid, 3),
    navGrowth5yCagr: periodGrowth(current, valid, 5),
  };
}

export function deriveInvestmentCompanyAnnualNavGrowth(
  observations: AnnualNavPerShareObservation[] | null | undefined,
  referenceYear?: number,
): InvestmentCompanyNavGrowth {
  const empty = emptyNavGrowth();
  const annual = observations ?? [];
  if (annual.length === 0) return empty;
  if (annual.some((observation) => (
    !Number.isInteger(observation.year)
    || observation.year < 1900
    || observation.year > 2200
    || !Number.isFinite(observation.navPerShare)
    || observation.navPerShare <= 0
  ))) {
    return empty;
  }

  const byYear = new Map<number, AnnualNavPerShareObservation>();
  for (const observation of annual) {
    if (byYear.has(observation.year)) return empty;
    byYear.set(observation.year, observation);
  }

  if (referenceYear !== undefined && !Number.isInteger(referenceYear)) return empty;

  const current = [...annual]
    .filter((observation) => referenceYear === undefined || observation.year < referenceYear)
    .sort((left, right) => right.year - left.year)[0];
  if (!current) return empty;
  if (referenceYear !== undefined && referenceYear - current.year > 1) return empty;

  return {
    navGrowth1y: annualPeriodGrowth(current, byYear, 1),
    navGrowth3yCagr: annualPeriodGrowth(current, byYear, 3),
    navGrowth5yCagr: annualPeriodGrowth(current, byYear, 5),
  };
}
