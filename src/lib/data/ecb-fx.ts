const ECB_FX_HISTORY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml";
const ECB_FX_PROVIDER = "ecb-euro-reference-rates";
const ECB_FX_METHOD = "ecb-fx-v1";
const ECB_TIMEOUT_MS = 8_000;
const ECB_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_MAX_LAG_DAYS = 7;

export type EcbReferenceRateObservation = {
  date: string;
  ratesPerEuro: Record<string, number>;
};

export type ComparisonFxContext = {
  status: "normalized" | "same_currency" | "unavailable";
  sourceCurrency: string;
  targetCurrency: string;
  rateDate: string | null;
  sourceRatePerEuro: number | null;
  targetRatePerEuro: number | null;
  provider: typeof ECB_FX_PROVIDER;
  methodologyVersion: typeof ECB_FX_METHOD;
};

type ComparisonFxRequest = {
  id: string;
  currency?: string | null;
  date: string;
};

type CachedHistory = {
  fetchedAt: number;
  observations: EcbReferenceRateObservation[];
};

let cachedHistory: CachedHistory | null = null;

function normalizeCurrency(currency: string | null | undefined) {
  const normalized = currency?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function utcDay(date: string) {
  const time = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(time) ? time : null;
}

function lagDays(earlier: string, later: string) {
  const left = utcDay(earlier);
  const right = utcDay(later);
  if (left === null || right === null) return Number.POSITIVE_INFINITY;
  return Math.floor((right - left) / 86_400_000);
}

export function parseEcbReferenceRateXml(xml: string): EcbReferenceRateObservation[] {
  const observations: EcbReferenceRateObservation[] = [];
  const dayPattern = /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']\s*>([\s\S]*?)<\/Cube>/g;
  const ratePattern = /<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([0-9]+(?:\.[0-9]+)?)["']\s*\/>/g;

  for (const dayMatch of xml.matchAll(dayPattern)) {
    const date = dayMatch[1];
    const ratesPerEuro: Record<string, number> = { EUR: 1 };
    for (const rateMatch of dayMatch[2].matchAll(ratePattern)) {
      const value = Number(rateMatch[2]);
      if (Number.isFinite(value) && value > 0) ratesPerEuro[rateMatch[1]] = value;
    }
    if (Object.keys(ratesPerEuro).length > 1) observations.push({ date, ratesPerEuro });
  }

  return observations.sort((left, right) => left.date.localeCompare(right.date));
}

export function selectEcbRatesAtOrBefore(
  observations: EcbReferenceRateObservation[],
  requestedDate: string,
  maxLagDays = DEFAULT_MAX_LAG_DAYS,
): EcbReferenceRateObservation | null {
  const requestedDay = requestedDate.slice(0, 10);
  if (utcDay(requestedDay) === null) return null;
  const candidate = [...observations]
    .filter((observation) => observation.date <= requestedDay)
    .sort((left, right) => right.date.localeCompare(left.date))[0] ?? null;
  if (!candidate) return null;
  const lag = lagDays(candidate.date, requestedDay);
  return lag >= 0 && lag <= maxLagDays ? candidate : null;
}

export function convertWithEcbRates(
  amount: number,
  sourceCurrency: string,
  targetCurrency: string,
  observation: EcbReferenceRateObservation,
): number | null {
  if (!Number.isFinite(amount)) return null;
  const source = normalizeCurrency(sourceCurrency);
  const target = normalizeCurrency(targetCurrency);
  if (!source || !target) return null;
  if (source === target) return amount;
  const sourceRate = observation.ratesPerEuro[source];
  const targetRate = observation.ratesPerEuro[target];
  if (!Number.isFinite(sourceRate) || sourceRate <= 0 || !Number.isFinite(targetRate) || targetRate <= 0) return null;
  return (amount / sourceRate) * targetRate;
}

async function fetchEcbHistoryAttempt(): Promise<EcbReferenceRateObservation[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ECB_TIMEOUT_MS);
  try {
    const response = await fetch(ECB_FX_HISTORY_URL, {
      headers: { Accept: "application/xml,text/xml;q=0.9,*/*;q=0.1" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`ECB FX HTTP ${response.status}`);
    const observations = parseEcbReferenceRateXml(await response.text());
    if (!observations.length) throw new Error("ECB FX payload contained no reference-rate observations");
    return observations;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchEcbReferenceRateHistory(): Promise<EcbReferenceRateObservation[]> {
  const now = Date.now();
  if (cachedHistory && now - cachedHistory.fetchedAt < ECB_CACHE_TTL_MS) return cachedHistory.observations;

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const observations = await fetchEcbHistoryAttempt();
      cachedHistory = { fetchedAt: now, observations };
      return observations;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("ECB FX request failed");
}

export async function resolveComparisonFxContexts(
  requests: ComparisonFxRequest[],
  targetCurrency = "EUR",
): Promise<Map<string, ComparisonFxContext>> {
  const target = normalizeCurrency(targetCurrency) ?? "EUR";
  const result = new Map<string, ComparisonFxContext>();
  if (!requests.length) return result;

  let observations: EcbReferenceRateObservation[] = [];
  try {
    observations = await fetchEcbReferenceRateHistory();
  } catch {
    // FX is an optional comparison enhancement; callers must fall back to native currency.
  }

  for (const request of requests) {
    const source = normalizeCurrency(request.currency);
    if (!source) {
      result.set(request.id, {
        status: "unavailable",
        sourceCurrency: request.currency?.trim().toUpperCase() || "N/A",
        targetCurrency: target,
        rateDate: null,
        sourceRatePerEuro: null,
        targetRatePerEuro: null,
        provider: ECB_FX_PROVIDER,
        methodologyVersion: ECB_FX_METHOD,
      });
      continue;
    }
    if (source === target) {
      result.set(request.id, {
        status: "same_currency",
        sourceCurrency: source,
        targetCurrency: target,
        rateDate: request.date.slice(0, 10),
        sourceRatePerEuro: 1,
        targetRatePerEuro: 1,
        provider: ECB_FX_PROVIDER,
        methodologyVersion: ECB_FX_METHOD,
      });
      continue;
    }
    const observation = selectEcbRatesAtOrBefore(observations, request.date);
    const sourceRate = observation?.ratesPerEuro[source];
    const targetRate = observation?.ratesPerEuro[target];
    if (!observation || !Number.isFinite(sourceRate) || !Number.isFinite(targetRate)) {
      result.set(request.id, {
        status: "unavailable",
        sourceCurrency: source,
        targetCurrency: target,
        rateDate: null,
        sourceRatePerEuro: null,
        targetRatePerEuro: null,
        provider: ECB_FX_PROVIDER,
        methodologyVersion: ECB_FX_METHOD,
      });
      continue;
    }
    result.set(request.id, {
      status: "normalized",
      sourceCurrency: source,
      targetCurrency: target,
      rateDate: observation.date,
      sourceRatePerEuro: sourceRate ?? null,
      targetRatePerEuro: targetRate ?? null,
      provider: ECB_FX_PROVIDER,
      methodologyVersion: ECB_FX_METHOD,
    });
  }
  return result;
}

export function convertWithComparisonFxContext(amount: number, context: ComparisonFxContext | undefined) {
  if (!context || context.status === "unavailable") return null;
  if (context.status === "same_currency") return Number.isFinite(amount) ? amount : null;
  if (context.rateDate === null || context.sourceRatePerEuro === null || context.targetRatePerEuro === null) return null;
  return convertWithEcbRates(amount, context.sourceCurrency, context.targetCurrency, {
    date: context.rateDate,
    ratesPerEuro: {
      EUR: 1,
      [context.sourceCurrency]: context.sourceRatePerEuro,
      [context.targetCurrency]: context.targetRatePerEuro,
    },
  });
}

export const ECB_FX_SOURCE_LABEL = "Source: ECB statistics";
export const ECB_FX_METHOD_VERSION = ECB_FX_METHOD;
