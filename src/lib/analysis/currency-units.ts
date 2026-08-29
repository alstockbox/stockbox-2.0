export type CurrencyUnit = {
  economicCurrency: string;
  quoteToEconomicScale: number;
};

const QUOTE_UNITS: Record<string, CurrencyUnit> = {
  GBp: { economicCurrency: "GBP", quoteToEconomicScale: 0.01 },
  GBX: { economicCurrency: "GBP", quoteToEconomicScale: 0.01 },
};

export function currencyUnit(value: string | null | undefined): CurrencyUnit | null {
  const raw = value?.trim();
  if (!raw) return null;
  const explicit = QUOTE_UNITS[raw] ?? (raw.toUpperCase() === "GBX" ? QUOTE_UNITS.GBX : undefined);
  return explicit ?? { economicCurrency: raw.toUpperCase(), quoteToEconomicScale: 1 };
}

export function economicCurrencyCode(value: string | null | undefined): string | null {
  return currencyUnit(value)?.economicCurrency ?? null;
}

export function quotePriceToEconomic(
  value: number | null | undefined,
  currency: string | null | undefined,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const unit = currencyUnit(currency);
  return unit ? value * unit.quoteToEconomicScale : value;
}
