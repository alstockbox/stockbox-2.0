import {
  computeLookThroughMetrics,
  type EtfHolding,
} from "@/lib/analysis/universal-security";

export type EtfHoldingFundamentalData = Partial<Omit<EtfHolding, "ticker" | "name" | "weight">>;

export type EtfHoldingFundamentalResult =
  | { ok: true; data: EtfHoldingFundamentalData }
  | { ok: false; message: string };

export type EtfHoldingFundamentalsFetcher = (
  holding: EtfHolding,
) => Promise<EtfHoldingFundamentalResult>;

export type EtfLookThroughEnrichmentResult = {
  holdings: EtfHolding[];
  verifiedQualityWeight: number;
  attemptedTickers: string[];
  failedTickers: string[];
  targetReached: boolean;
  budgetExhausted: boolean;
};

const DEFAULT_MAX_REQUESTS = 12;
const LOOK_THROUGH_QUALITY_TARGET_WEIGHT = 0.80;

function hasVerifiedQualityEvidence(holding: EtfHolding): boolean {
  return computeLookThroughMetrics([{ ...holding, weight: 1 }]).qualityCoveredWeight >= 1;
}

function isEnrichmentCandidate(holding: EtfHolding): boolean {
  return (
    typeof holding.ticker === "string"
    && holding.ticker.trim().length > 0
    && Number.isFinite(holding.weight)
    && holding.weight > 0
    && !hasVerifiedQualityEvidence(holding)
  );
}

function mergeVerifiedFields(
  holding: EtfHolding,
  data: EtfHoldingFundamentalData,
): EtfHolding {
  return {
    ...holding,
    sector: holding.sector ?? data.sector,
    country: holding.country ?? data.country,
    stockBoxScore: holding.stockBoxScore ?? data.stockBoxScore,
    revenueGrowth: holding.revenueGrowth ?? data.revenueGrowth,
    epsGrowth: holding.epsGrowth ?? data.epsGrowth,
    roic: holding.roic ?? data.roic,
    operatingMargin: holding.operatingMargin ?? data.operatingMargin,
    netDebtToEbitda: holding.netDebtToEbitda ?? data.netDebtToEbitda,
    forwardPe: holding.forwardPe ?? data.forwardPe,
    priceBook: holding.priceBook ?? data.priceBook,
    freeCashFlowYield: holding.freeCashFlowYield ?? data.freeCashFlowYield,
    dividendYield: holding.dividendYield ?? data.dividendYield,
  };
}

function qualityWeight(holdings: EtfHolding[]): number {
  return computeLookThroughMetrics(holdings).qualityCoveredWeight;
}

function maximumReachableQualityWeight(holdings: EtfHolding[]): number {
  const optimistic = holdings.map((holding) => {
    if (!isEnrichmentCandidate(holding)) return holding;
    return {
      ...holding,
      revenueGrowth: holding.revenueGrowth ?? 0,
      operatingMargin: holding.operatingMargin ?? 0,
    };
  });
  return qualityWeight(optimistic);
}

export async function enrichEtfLookThroughHoldings(
  holdings: EtfHolding[],
  fetchHolding: EtfHoldingFundamentalsFetcher,
  options: { maxRequests?: number } = {},
): Promise<EtfLookThroughEnrichmentResult> {
  const enriched = holdings.map((holding) => ({ ...holding }));
  const maxRequests = Math.max(0, Math.floor(options.maxRequests ?? DEFAULT_MAX_REQUESTS));
  const attemptedTickers: string[] = [];
  const failedTickers: string[] = [];
  let verifiedQualityWeight = qualityWeight(enriched);

  if (verifiedQualityWeight >= LOOK_THROUGH_QUALITY_TARGET_WEIGHT) {
    return {
      holdings: enriched,
      verifiedQualityWeight,
      attemptedTickers,
      failedTickers,
      targetReached: true,
      budgetExhausted: false,
    };
  }

  if (maximumReachableQualityWeight(enriched) < LOOK_THROUGH_QUALITY_TARGET_WEIGHT) {
    return {
      holdings: enriched,
      verifiedQualityWeight,
      attemptedTickers,
      failedTickers,
      targetReached: false,
      budgetExhausted: false,
    };
  }

  const candidates = enriched
    .map((holding, index) => ({ holding, index }))
    .filter(({ holding }) => isEnrichmentCandidate(holding))
    .sort((left, right) => right.holding.weight - left.holding.weight);

  let candidateIndex = 0;
  while (
    candidateIndex < candidates.length
    && attemptedTickers.length < maxRequests
    && verifiedQualityWeight < LOOK_THROUGH_QUALITY_TARGET_WEIGHT
  ) {
    const candidate = candidates[candidateIndex];
    candidateIndex += 1;
    const ticker = candidate.holding.ticker!.trim();
    attemptedTickers.push(ticker);

    const result = await fetchHolding(candidate.holding);
    if (!result.ok) {
      failedTickers.push(ticker);
      continue;
    }

    enriched[candidate.index] = mergeVerifiedFields(enriched[candidate.index], result.data);
    verifiedQualityWeight = qualityWeight(enriched);
  }

  const targetReached = verifiedQualityWeight >= LOOK_THROUGH_QUALITY_TARGET_WEIGHT;
  return {
    holdings: enriched,
    verifiedQualityWeight,
    attemptedTickers,
    failedTickers,
    targetReached,
    budgetExhausted: !targetReached
      && attemptedTickers.length >= maxRequests
      && candidateIndex < candidates.length,
  };
}
