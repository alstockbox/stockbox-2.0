export type PlanKey = "free" | "basic" | "standard" | "premium" | "elite";
export type StripePriceEnv =
  | "STRIPE_PRICE_BASIC_MONTHLY"
  | "STRIPE_PRICE_STANDARD_MONTHLY"
  | "STRIPE_PRICE_PREMIUM_MONTHLY"
  | "STRIPE_PRICE_ELITE_MONTHLY";

export type Entitlements = {
  monthlyAnalyses: number;
  deepAnalyses: number;
  watchlistItems: number;
  batchRows: number;
  portfolios: number;
  aiAssistant: boolean;
  hourlyAlerts: boolean;
};

export type Plan = {
  key: PlanKey;
  name: string;
  monthlyPriceSek: number;
  stripeEnv?: StripePriceEnv;
  entitlements: Entitlements;
  highlight?: boolean;
};

export const plans: Plan[] = [
  {
    key: "free",
    name: "Free",
    monthlyPriceSek: 0,
    entitlements: {
      monthlyAnalyses: 5,
      deepAnalyses: 1,
      watchlistItems: 5,
      batchRows: 0,
      portfolios: 1,
      aiAssistant: false,
      hourlyAlerts: false
    }
  },
  {
    key: "basic",
    name: "Basic",
    monthlyPriceSek: 79,
    stripeEnv: "STRIPE_PRICE_BASIC_MONTHLY",
    entitlements: {
      monthlyAnalyses: 30,
      deepAnalyses: 8,
      watchlistItems: 20,
      batchRows: 10,
      portfolios: 2,
      aiAssistant: false,
      hourlyAlerts: false
    }
  },
  {
    key: "standard",
    name: "Standard",
    monthlyPriceSek: 149,
    stripeEnv: "STRIPE_PRICE_STANDARD_MONTHLY",
    highlight: true,
    entitlements: {
      monthlyAnalyses: 100,
      deepAnalyses: 30,
      watchlistItems: 75,
      batchRows: 50,
      portfolios: 5,
      aiAssistant: true,
      hourlyAlerts: true
    }
  },
  {
    key: "premium",
    name: "Premium",
    monthlyPriceSek: 299,
    stripeEnv: "STRIPE_PRICE_PREMIUM_MONTHLY",
    entitlements: {
      monthlyAnalyses: 300,
      deepAnalyses: 120,
      watchlistItems: 250,
      batchRows: 250,
      portfolios: 15,
      aiAssistant: true,
      hourlyAlerts: true
    }
  },
  {
    key: "elite",
    name: "Elite",
    monthlyPriceSek: 599,
    stripeEnv: "STRIPE_PRICE_ELITE_MONTHLY",
    entitlements: {
      monthlyAnalyses: 1000,
      deepAnalyses: 400,
      watchlistItems: 1000,
      batchRows: 1000,
      portfolios: 50,
      aiAssistant: true,
      hourlyAlerts: true
    }
  }
];

export function getPlan(key: PlanKey) {
  return plans.find((plan) => plan.key === key) ?? plans[0];
}

export function getPlanByStripePrice(priceId: string | null | undefined, env = process.env): Plan | null {
  if (!priceId) return null;
  return (
    plans.find((plan) => plan.stripeEnv && env[plan.stripeEnv] && env[plan.stripeEnv] === priceId) ??
    null
  );
}
