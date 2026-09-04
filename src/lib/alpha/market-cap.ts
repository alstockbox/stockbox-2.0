export type MarketCapBand = "micro" | "small" | "mid" | "large" | "mega" | "unknown";

export const MARKET_CAP_POLICY_VERSION = "market-cap-bands-1.0.0";

type Thresholds = {
  microMax: number;
  smallMax: number;
  midMax: number;
  largeMax: number;
};

// These are versioned size-classification policy thresholds expressed directly
// in each trading currency. They intentionally avoid pretending that a stale
// hard-coded FX conversion is live market data.
const THRESHOLDS: Record<string, Thresholds> = {
  USD: { microMax: 300_000_000, smallMax: 2_000_000_000, midMax: 10_000_000_000, largeMax: 200_000_000_000 },
  EUR: { microMax: 275_000_000, smallMax: 1_850_000_000, midMax: 9_250_000_000, largeMax: 185_000_000_000 },
  GBP: { microMax: 225_000_000, smallMax: 1_500_000_000, midMax: 7_500_000_000, largeMax: 150_000_000_000 },
  SEK: { microMax: 3_000_000_000, smallMax: 20_000_000_000, midMax: 100_000_000_000, largeMax: 2_000_000_000_000 },
  NOK: { microMax: 3_000_000_000, smallMax: 20_000_000_000, midMax: 100_000_000_000, largeMax: 2_000_000_000_000 },
  DKK: { microMax: 2_000_000_000, smallMax: 13_500_000_000, midMax: 67_500_000_000, largeMax: 1_350_000_000_000 },
  CHF: { microMax: 240_000_000, smallMax: 1_600_000_000, midMax: 8_000_000_000, largeMax: 160_000_000_000 },
  CAD: { microMax: 405_000_000, smallMax: 2_700_000_000, midMax: 13_500_000_000, largeMax: 270_000_000_000 },
  AUD: { microMax: 450_000_000, smallMax: 3_000_000_000, midMax: 15_000_000_000, largeMax: 300_000_000_000 },
  JPY: { microMax: 45_000_000_000, smallMax: 300_000_000_000, midMax: 1_500_000_000_000, largeMax: 30_000_000_000_000 },
};

export function resolveMarketCapBand(marketCap: number | null | undefined, currency: string | null | undefined): MarketCapBand {
  if (typeof marketCap !== "number" || !Number.isFinite(marketCap) || marketCap <= 0) return "unknown";
  const thresholds = currency ? THRESHOLDS[currency.trim().toUpperCase()] : undefined;
  if (!thresholds) return "unknown";
  if (marketCap <= thresholds.microMax) return "micro";
  if (marketCap <= thresholds.smallMax) return "small";
  if (marketCap <= thresholds.midMax) return "mid";
  if (marketCap <= thresholds.largeMax) return "large";
  return "mega";
}

export function sizePotentialForBand(band: MarketCapBand): number {
  switch (band) {
    case "micro": return 100;
    case "small": return 82;
    case "mid": return 45;
    case "large": return 18;
    case "mega": return 8;
    default: return 20;
  }
}

export function capLiquidityRiskForBand(band: MarketCapBand): number {
  switch (band) {
    case "micro": return 78;
    case "small": return 52;
    case "mid": return 28;
    case "large": return 14;
    case "mega": return 8;
    default: return 45;
  }
}
