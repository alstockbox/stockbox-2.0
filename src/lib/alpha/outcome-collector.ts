import "server-only";

import type { CompanySearchResult } from "../analysis/types";
import { fetchConfiguredMarketData } from "../data/provider";
import { createAdminClient } from "../supabase/admin";
import { selectMaturedOutcomeWindows, type AlphaOutcomeHorizonDays } from "./outcomes";
import { recordAlphaPredictionOutcome } from "./repository";

type MaturedPrediction = {
  id: string;
  ticker: string;
  company_name: string;
  price_currency: string | null;
  prediction_as_of: string;
};

export type AlphaOutcomeCollectionResult = {
  ok: boolean;
  considered: number;
  recorded: number;
  skipped: number;
  failed: number;
  byHorizon: Record<AlphaOutcomeHorizonDays, { considered: number; recorded: number; failed: number }>;
};

function outcomeCompany(row: MaturedPrediction): CompanySearchResult {
  return {
    ticker: row.ticker,
    canonicalTicker: row.ticker,
    name: row.company_name,
    currency: row.price_currency ?? undefined,
    securityType: "Common Stock",
    providerCapabilities: {
      fundamentals: false,
      marketData: true,
      providerIds: [],
    },
  };
}

export async function collectMaturedAlphaOutcomes(options: {
  limit?: number;
  maxLagDays?: number;
} = {}): Promise<AlphaOutcomeCollectionResult> {
  const supabase = createAdminClient();
  const empty = (): AlphaOutcomeCollectionResult => ({
    ok: false,
    considered: 0,
    recorded: 0,
    skipped: 0,
    failed: 0,
    byHorizon: {
      30: { considered: 0, recorded: 0, failed: 0 },
      90: { considered: 0, recorded: 0, failed: 0 },
      180: { considered: 0, recorded: 0, failed: 0 },
      365: { considered: 0, recorded: 0, failed: 0 },
    },
  });
  if (!supabase) return empty();

  const limit = Math.min(100, Math.max(1, Math.floor(options.limit ?? 20)));
  const maxLagDays = Math.min(14, Math.max(0, Math.floor(options.maxLagDays ?? 7)));
  const windows = selectMaturedOutcomeWindows(new Date().toISOString(), maxLagDays);
  const result = empty();
  result.ok = true;

  for (const window of windows) {
    if (result.considered >= limit) break;
    const remaining = limit - result.considered;
    const predictionResult = await supabase
      .from("alpha_predictions")
      .select("id,ticker,company_name,price_currency,prediction_as_of")
      .not("price_at_prediction", "is", null)
      .gte("prediction_as_of", window.predictionFrom)
      .lte("prediction_as_of", window.predictionTo)
      .order("prediction_as_of", { ascending: true })
      .limit(Math.max(remaining * 3, remaining));

    if (predictionResult.error || !predictionResult.data?.length) continue;
    const candidates = predictionResult.data as MaturedPrediction[];
    const predictionIds = candidates.map((row) => row.id);
    const existingResult = await supabase
      .from("alpha_prediction_outcomes")
      .select("prediction_id")
      .eq("horizon_days", window.horizonDays)
      .in("prediction_id", predictionIds);
    if (existingResult.error) {
      result.failed += Math.min(remaining, candidates.length);
      result.byHorizon[window.horizonDays].failed += Math.min(remaining, candidates.length);
      result.ok = false;
      continue;
    }
    const existing = new Set((existingResult.data ?? []).map((row) => String(row.prediction_id)));
    const pending = candidates.filter((row) => !existing.has(row.id)).slice(0, remaining);

    for (const prediction of pending) {
      result.considered += 1;
      result.byHorizon[window.horizonDays].considered += 1;
      try {
        const market = await fetchConfiguredMarketData(outcomeCompany(prediction));
        if (!market.ok || !market.data.price || !market.data.date) {
          result.failed += 1;
          result.byHorizon[window.horizonDays].failed += 1;
          continue;
        }

        const write = await recordAlphaPredictionOutcome({
          predictionId: prediction.id,
          horizonDays: window.horizonDays,
          priceEnd: market.data.price,
          marketDataAsOf: market.data.date,
        });
        if (write.ok) {
          result.recorded += 1;
          result.byHorizon[window.horizonDays].recorded += 1;
        } else if (write.reason === "not_evaluable") {
          result.skipped += 1;
        } else {
          result.failed += 1;
          result.byHorizon[window.horizonDays].failed += 1;
        }
      } catch {
        result.failed += 1;
        result.byHorizon[window.horizonDays].failed += 1;
      }
    }
  }

  result.ok = result.failed === 0;
  return result;
}
