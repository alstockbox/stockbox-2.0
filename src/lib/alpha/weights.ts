export type AlphaWeightKey =
  | "growthAcceleration"
  | "earningsInflection"
  | "undervaluation"
  | "quality"
  | "catalyst"
  | "momentum"
  | "estimateRevisions"
  | "sentimentShift"
  | "smallCapAsymmetry";

export type AlphaWeightProfile = {
  name: string;
  support: number;
  weights: Record<AlphaWeightKey, number>;
};

const BASE: Record<AlphaWeightKey, number> = {
  growthAcceleration: 0.17,
  earningsInflection: 0.16,
  undervaluation: 0.16,
  quality: 0.14,
  catalyst: 0.11,
  momentum: 0.10,
  estimateRevisions: 0.07,
  sentimentShift: 0.03,
  smallCapAsymmetry: 0.06,
};

const RAW_PROFILES: Record<string, { support: number; weights: Partial<Record<AlphaWeightKey, number>> }> = {
  standard: { support: 1, weights: {} },
  software_growth: {
    support: 1,
    weights: {
      growthAcceleration: 0.22,
      earningsInflection: 0.18,
      undervaluation: 0.10,
      quality: 0.16,
      catalyst: 0.10,
      momentum: 0.10,
      estimateRevisions: 0.08,
      sentimentShift: 0.02,
      smallCapAsymmetry: 0.04,
    },
  },
  cyclical: {
    support: 0.9,
    weights: {
      growthAcceleration: 0.16,
      earningsInflection: 0.18,
      undervaluation: 0.16,
      quality: 0.10,
      catalyst: 0.15,
      momentum: 0.12,
      estimateRevisions: 0.06,
      sentimentShift: 0.02,
      smallCapAsymmetry: 0.05,
    },
  },
  utility: {
    support: 0.82,
    weights: {
      growthAcceleration: 0.09,
      earningsInflection: 0.12,
      undervaluation: 0.21,
      quality: 0.21,
      catalyst: 0.10,
      momentum: 0.08,
      estimateRevisions: 0.09,
      sentimentShift: 0.02,
      smallCapAsymmetry: 0.08,
    },
  },
  bank: {
    support: 0.68,
    weights: {
      growthAcceleration: 0.08,
      earningsInflection: 0.15,
      undervaluation: 0.18,
      quality: 0.24,
      catalyst: 0.08,
      momentum: 0.10,
      estimateRevisions: 0.10,
      sentimentShift: 0.02,
      smallCapAsymmetry: 0.05,
    },
  },
  insurer: {
    support: 0.68,
    weights: {
      growthAcceleration: 0.08,
      earningsInflection: 0.14,
      undervaluation: 0.19,
      quality: 0.24,
      catalyst: 0.08,
      momentum: 0.10,
      estimateRevisions: 0.10,
      sentimentShift: 0.02,
      smallCapAsymmetry: 0.05,
    },
  },
  reit: {
    support: 0.62,
    weights: {
      growthAcceleration: 0.08,
      earningsInflection: 0.12,
      undervaluation: 0.22,
      quality: 0.22,
      catalyst: 0.10,
      momentum: 0.09,
      estimateRevisions: 0.08,
      sentimentShift: 0.02,
      smallCapAsymmetry: 0.07,
    },
  },
  property_company: {
    support: 0.62,
    weights: {
      growthAcceleration: 0.08,
      earningsInflection: 0.12,
      undervaluation: 0.23,
      quality: 0.21,
      catalyst: 0.10,
      momentum: 0.09,
      estimateRevisions: 0.08,
      sentimentShift: 0.02,
      smallCapAsymmetry: 0.07,
    },
  },
  asset_manager: {
    support: 0.72,
    weights: {
      growthAcceleration: 0.12,
      earningsInflection: 0.16,
      undervaluation: 0.16,
      quality: 0.20,
      catalyst: 0.09,
      momentum: 0.10,
      estimateRevisions: 0.09,
      sentimentShift: 0.03,
      smallCapAsymmetry: 0.05,
    },
  },
  holding_company: {
    support: 0.58,
    weights: {
      growthAcceleration: 0.08,
      earningsInflection: 0.10,
      undervaluation: 0.25,
      quality: 0.21,
      catalyst: 0.10,
      momentum: 0.08,
      estimateRevisions: 0.07,
      sentimentShift: 0.02,
      smallCapAsymmetry: 0.09,
    },
  },
  pre_revenue_biotech: {
    support: 0.45,
    weights: {
      growthAcceleration: 0.07,
      earningsInflection: 0.05,
      undervaluation: 0.04,
      quality: 0.08,
      catalyst: 0.30,
      momentum: 0.10,
      estimateRevisions: 0.11,
      sentimentShift: 0.05,
      smallCapAsymmetry: 0.20,
    },
  },
  unknown: { support: 0.65, weights: {} },
};

function normalize(weights: Record<AlphaWeightKey, number>): Record<AlphaWeightKey, number> {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) return { ...BASE };
  return Object.fromEntries(
    Object.entries(weights).map(([key, value]) => [key, value / total]),
  ) as Record<AlphaWeightKey, number>;
}

export function getAlphaWeightProfile(archetype: string | null | undefined): AlphaWeightProfile {
  const key = archetype?.trim().toLowerCase() || "unknown";
  const raw = RAW_PROFILES[key] ?? RAW_PROFILES.unknown!;
  const merged = { ...BASE, ...raw.weights };
  return {
    name: RAW_PROFILES[key] ? key : "unknown",
    support: Math.min(1, Math.max(0, raw.support)),
    weights: normalize(merged),
  };
}
