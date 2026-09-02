const MONEY_FORMATTERS: Map<string, Intl.NumberFormat> = new Map();

export function formatMinorMoney(amountMinor: bigint | number, currency = "SEK") {
  const key = currency.toUpperCase();
  const formatter =
    MONEY_FORMATTERS.get(key) ??
    new Intl.NumberFormat("sv-SE", {
      style: "currency",
      currency: key,
      maximumFractionDigits: 0
    });
  MONEY_FORMATTERS.set(key, formatter);
  return formatter.format(Number(amountMinor) / 100);
}

export function formatSignedMinorMoney(amountMinor: bigint | number, currency = "SEK") {
  const value = typeof amountMinor === "bigint" ? amountMinor : BigInt(amountMinor);
  return `${value > 0n ? "+" : ""}${formatMinorMoney(value, currency)}`;
}

export function formatPercentFromBps(valueBps: number) {
  return `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(valueBps / 100)}%`;
}
