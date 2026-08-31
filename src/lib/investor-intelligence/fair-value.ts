export type FairValueMethod = "DCF" | "HISTORICAL_MULTIPLE" | "PEER" | "FORWARD_EARNINGS";

export type FairValueMethodInput = {
  method: FairValueMethod;
  impliedValue: number | null;
  low: number | null;
  high: number | null;
  baseWeight: number;
  confidence: number;
  unavailableReason?: string;
};

export type FairValueMethodUsed = FairValueMethodInput & {
  impliedValue: number;
  weight: number;
};

export type CompositeFairValueResult = {
  status: "available" | "unavailable";
  currentPrice: number | null;
  fairValue: number | null;
  bear: number | null;
  base: number | null;
  bull: number | null;
  upsideDownside: number | null;
  marginOfSafety: number | null;
  confidence: number | null;
  methodsUsed: FairValueMethodUsed[];
  unavailableMethods: Array<{ method: FairValueMethod; reason: string }>;
};

function validPositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function buildCompositeFairValue(input: {
  currentPrice: number | null;
  methods: FairValueMethodInput[];
}): CompositeFairValueResult {
  const available = input.methods.filter(
    (method): method is FairValueMethodInput & { impliedValue: number } =>
      validPositive(method.impliedValue) && Number.isFinite(method.baseWeight) && method.baseWeight > 0,
  );
  const unavailableMethods = input.methods
    .filter((method) => !available.includes(method as FairValueMethodInput & { impliedValue: number }))
    .map((method) => ({
      method: method.method,
      reason: method.unavailableReason ?? "Required valuation inputs are unavailable or invalid.",
    }));

  const totalWeight = available.reduce((sum, method) => sum + method.baseWeight, 0);
  if (!available.length || totalWeight <= 0) {
    return {
      status: "unavailable",
      currentPrice: validPositive(input.currentPrice) ? input.currentPrice : null,
      fairValue: null,
      bear: null,
      base: null,
      bull: null,
      upsideDownside: null,
      marginOfSafety: null,
      confidence: null,
      methodsUsed: [],
      unavailableMethods,
    };
  }

  const methodsUsed: FairValueMethodUsed[] = available.map((method) => ({
    ...method,
    weight: method.baseWeight / totalWeight,
  }));
  const weighted = (selector: (method: FairValueMethodUsed) => number) =>
    methodsUsed.reduce((sum, method) => sum + selector(method) * method.weight, 0);

  const fairValue = weighted((method) => method.impliedValue);
  const bear = weighted((method) => validPositive(method.low) ? method.low : method.impliedValue);
  const bull = weighted((method) => validPositive(method.high) ? method.high : method.impliedValue);
  const confidence = weighted((method) => clamp01(method.confidence));
  const currentPrice = validPositive(input.currentPrice) ? input.currentPrice : null;

  return {
    status: "available",
    currentPrice,
    fairValue,
    bear,
    base: fairValue,
    bull,
    upsideDownside: currentPrice ? fairValue / currentPrice - 1 : null,
    marginOfSafety: currentPrice ? 1 - currentPrice / fairValue : null,
    confidence,
    methodsUsed,
    unavailableMethods,
  };
}
