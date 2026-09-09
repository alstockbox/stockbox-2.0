from pathlib import Path

path = Path("src/lib/data/yahoo-market.ts")
text = path.read_text()

old_timeout = "const YAHOO_REQUEST_TIMEOUT_MS = 10_000;\n"
new_timeout = (
    "const YAHOO_REQUEST_TIMEOUT_MS = 10_000;\n"
    "const CORPORATE_ACTIONS_REVALIDATE_SECONDS = 60 * 60 * 6;\n"
)
assert text.count(old_timeout) == 1, text.count(old_timeout)
text = text.replace(old_timeout, new_timeout, 1)

helper = '''type CorporateActions = {
  dividendEvents: MarketDividendEvent[];
  splitEvents: MarketSplitEvent[];
};

async function fetchMaximumCorporateActions(
  symbol: string,
  currency: string | null,
): Promise<CorporateActions | null> {
  const url = new URL(`${BASE_URL}/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", "max");
  url.searchParams.set("interval", "1mo");
  url.searchParams.set("events", "div,splits");
  url.searchParams.set("includeAdjustedClose", "false");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), YAHOO_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
      next: { revalidate: CORPORATE_ACTIONS_REVALIDATE_SECONDS },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("json")) return null;
    const payload = object(await response.json());
    if (!payload || yahooError(payload)) return null;
    const result = firstChartResult(payload);
    if (!result) return null;
    const observedSymbol = stringValue(object(result.meta)?.symbol);
    if (observedSymbol && !yahooSymbolsEquivalent(symbol, observedSymbol)) return null;
    return {
      dividendEvents: parseDividendEvents(result, currency),
      splitEvents: parseSplitEvents(result),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function mergeDividendEvents(
  baseEvents: MarketDividendEvent[] = [],
  extendedEvents: MarketDividendEvent[] = [],
): MarketDividendEvent[] {
  const deduped = new Map<string, MarketDividendEvent>();
  for (const event of [...baseEvents, ...extendedEvents]) {
    deduped.set(`${event.date}:${event.amount}`, event);
  }
  return [...deduped.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function mergeSplitEvents(
  baseEvents: MarketSplitEvent[] = [],
  extendedEvents: MarketSplitEvent[] = [],
): MarketSplitEvent[] {
  const deduped = new Map<string, MarketSplitEvent>();
  for (const event of [...baseEvents, ...extendedEvents]) {
    deduped.set(
      `${event.date}:${event.numerator ?? ""}:${event.denominator ?? ""}:${event.splitRatio ?? ""}`,
      event,
    );
  }
  return [...deduped.values()].sort((left, right) => left.date.localeCompare(right.date));
}
'''

anchor = '\nfunction performance(rows: PriceRow[]): MarketSnapshot["performance"] {'
assert text.count(anchor) == 1, text.count(anchor)
text = text.replace(anchor, "\n" + helper + anchor, 1)

old_events = '''    const marketCurrency = stringValue(meta.currency) ?? company.currency ?? null;
    const dividendEvents = parseDividendEvents(result, marketCurrency);
    const splitEvents = parseSplitEvents(result);
'''
new_events = '''    const marketCurrency = stringValue(meta.currency) ?? company.currency ?? null;
    const baseDividendEvents = parseDividendEvents(result, marketCurrency);
    const baseSplitEvents = parseSplitEvents(result);
    const maximumCorporateActions = await fetchMaximumCorporateActions(symbol, marketCurrency);
    const dividendEvents = maximumCorporateActions
      ? mergeDividendEvents(baseDividendEvents, maximumCorporateActions.dividendEvents)
      : baseDividendEvents;
    const splitEvents = maximumCorporateActions
      ? mergeSplitEvents(baseSplitEvents, maximumCorporateActions.splitEvents)
      : baseSplitEvents;
'''
assert text.count(old_events) == 1, text.count(old_events)
text = text.replace(old_events, new_events, 1)

path.write_text(text)
