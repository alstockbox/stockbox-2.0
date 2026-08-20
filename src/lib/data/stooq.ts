import type { MarketSnapshot } from "@/lib/analysis/types";

type PriceRow = {
  date: string;
  close: number;
  volume: number | null;
};

function normalizeTicker(ticker: string) {
  const clean = ticker.trim().toLowerCase().replace(".", "-");
  if (clean.includes(".")) return clean;
  if (/^[a-z-]+$/.test(clean)) return `${clean}.us`;
  return clean;
}

function parseCsvRows(csv: string): PriceRow[] {
  const [, ...lines] = csv.trim().split(/\r?\n/);
  return lines
    .map((line) => line.split(","))
    .map(([date, open, high, low, close, volume]) => ({
      date,
      close: Number(close || open || high || low),
      volume: volume ? Number(volume) : null
    }))
    .filter((row) => row.date && Number.isFinite(row.close));
}

function performance(rows: PriceRow[], days: number) {
  const latest = rows.at(-1);
  const earlier = rows.at(Math.max(0, rows.length - 1 - days));
  if (!latest || !earlier || earlier.close === 0) return null;
  return latest.close / earlier.close - 1;
}

export async function fetchMarketSnapshot(ticker: string): Promise<MarketSnapshot | null> {
  const symbol = normalizeTicker(ticker);
  const response = await fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`, {
    next: { revalidate: 60 * 15 }
  });

  if (!response.ok) return null;

  const rows = parseCsvRows(await response.text());
  if (!rows.length) return null;

  const latest = rows.at(-1)!;
  const oneYearRows = rows.slice(-252);
  const yearHigh = Math.max(...oneYearRows.map((row) => row.close));
  const yearLow = Math.min(...oneYearRows.map((row) => row.close));

  return {
    ticker,
    price: latest.close,
    currency: "USD",
    date: latest.date,
    volume: latest.volume,
    yearHigh,
    yearLow,
    performance: {
      "1D": performance(rows, 1) ?? undefined,
      "1W": performance(rows, 5) ?? undefined,
      "1M": performance(rows, 21) ?? undefined,
      "3M": performance(rows, 63) ?? undefined,
      "6M": performance(rows, 126) ?? undefined,
      YTD: (() => {
        const yearStart = rows.find((row) => row.date.startsWith(latest.date.slice(0, 4)));
        return yearStart && yearStart.close !== 0 ? latest.close / yearStart.close - 1 : undefined;
      })(),
      "1Y": performance(rows, 252) ?? undefined
    }
  };
}
