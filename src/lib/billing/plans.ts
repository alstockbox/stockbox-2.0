export type PlanKey = "free" | "basic" | "standard" | "premium" | "elite";
export type StripePriceEnv =
  | "STRIPE_PRICE_BASIC_MONTHLY"
  | "STRIPE_PRICE_STANDARD_MONTHLY"
  | "STRIPE_PRICE_PREMIUM_MONTHLY"
  | "STRIPE_PRICE_ELITE_MONTHLY";
export type StripeCouponEnv =
  | "STRIPE_COUPON_BASIC_LAUNCH"
  | "STRIPE_COUPON_STANDARD_LAUNCH"
  | "STRIPE_COUPON_PREMIUM_LAUNCH";
export type CommercialStatus = "active" | "inactive";

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
  commercialStatus: CommercialStatus;
  monthlyPriceSek: number | null;
  stripeEnv?: StripePriceEnv;
  launchOffer?: {
    monthlyPriceSek: number;
    durationMonths: number;
    thenMonthlyPriceSek: number;
    stripeCouponEnv: StripeCouponEnv;
  };
  entitlements: Entitlements;
  highlight?: boolean;
};

export const plans: Plan[] = [
  {
    key: "free",
    name: "Free",
    commercialStatus: "active",
    monthlyPriceSek: 0,
    entitlements: {
      monthlyAnalyses: 3,
      deepAnalyses: 1,
      watchlistItems: 5,
      batchRows: 0,
      portfolios: 1,
      aiAssistant: false,
      hourlyAlerts: false,
    },
  },
  {
    key: "basic",
    name: "Basic",
    commercialStatus: "active",
    monthlyPriceSek: 69,
    stripeEnv: "STRIPE_PRICE_BASIC_MONTHLY",
    launchOffer: {
      monthlyPriceSek: 49,
      durationMonths: 3,
      thenMonthlyPriceSek: 69,
      stripeCouponEnv: "STRIPE_COUPON_BASIC_LAUNCH",
    },
    entitlements: {
      monthlyAnalyses: 10,
      deepAnalyses: 3,
      watchlistItems: 20,
      batchRows: 10,
      portfolios: 2,
      aiAssistant: false,
      hourlyAlerts: false,
    },
  },
  {
    key: "standard",
    name: "Standard",
    commercialStatus: "active",
    monthlyPriceSek: 119,
    stripeEnv: "STRIPE_PRICE_STANDARD_MONTHLY",
    launchOffer: {
      monthlyPriceSek: 79,
      durationMonths: 3,
      thenMonthlyPriceSek: 119,
      stripeCouponEnv: "STRIPE_COUPON_STANDARD_LAUNCH",
    },
    entitlements: {
      monthlyAnalyses: 35,
      deepAnalyses: 12,
      watchlistItems: 75,
      batchRows: 25,
      portfolios: 5,
      aiAssistant: false,
      hourlyAlerts: false,
    },
    highlight: true,
  },
  {
    key: "premium",
    name: "Pro",
    commercialStatus: "active",
    monthlyPriceSek: 179,
    stripeEnv: "STRIPE_PRICE_PREMIUM_MONTHLY",
    launchOffer: {
      monthlyPriceSek: 159,
      durationMonths: 3,
      thenMonthlyPriceSek: 179,
      stripeCouponEnv: "STRIPE_COUPON_PREMIUM_LAUNCH",
    },
    entitlements: {
      monthlyAnalyses: 90,
      deepAnalyses: 35,
      watchlistItems: 250,
      batchRows: 50,
      portfolios: 15,
      aiAssistant: false,
      hourlyAlerts: false,
    },
  },
  {
    key: "elite",
    name: "Elite",
    commercialStatus: "active",
    monthlyPriceSek: 399,
    stripeEnv: "STRIPE_PRICE_ELITE_MONTHLY",
    entitlements: {
      monthlyAnalyses: 350,
      deepAnalyses: 150,
      watchlistItems: 1000,
      batchRows: 50,
      portfolios: 50,
      aiAssistant: false,
      hourlyAlerts: false,
    },
  },
];

export const commerciallyActivePlans = plans.filter(
  (plan) => plan.commercialStatus === "active" && plan.monthlyPriceSek !== null,
);

export function findPlan(key: string): Plan | null {
  return plans.find((plan) => plan.key === key) ?? null;
}

export function isPlanPurchasable(plan: Plan): boolean {
  return plan.commercialStatus === "active" && plan.key !== "free" && plan.monthlyPriceSek !== null && Boolean(plan.stripeEnv);
}

export function getPlan(key: PlanKey) {
  return findPlan(key) ?? plans[0];
}

export function getPlanByStripePrice(priceId: string | null | undefined, env = process.env): Plan | null {
  if (!priceId) return null;
  return plans.find((plan) => plan.stripeEnv && env[plan.stripeEnv] && env[plan.stripeEnv] === priceId) ?? null;
}