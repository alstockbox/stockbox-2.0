import { getMarketDataProvider, getMarketDataProviderChain, getSecUserAgent, getServerEnv } from "@/lib/env/server";
import { SEC_CAPABILITIES } from "@/lib/data/sec";
import { STOOQ_CAPABILITIES } from "@/lib/data/stooq";
import { TWELVE_DATA_CAPABILITIES } from "@/lib/data/twelve-data";
import { YAHOO_MARKET_CAPABILITIES } from "@/lib/data/yahoo-market";
import { configuredMarketDataProviderStatuses } from "@/lib/data/provider";

export const dynamic = "force-dynamic";

export function GET() {
  const env = getServerEnv();
  const marketProvider = getMarketDataProvider(env);
  const marketProviderChain = getMarketDataProviderChain(env);
  const marketProviderStatuses = configuredMarketDataProviderStatuses(env);
  const resolvedMarketProvider = marketProviderStatuses.find((provider) => provider.configured);
  const marketConfigured = Boolean(resolvedMarketProvider);
  const resolvedProvider = resolvedMarketProvider?.key ?? "disabled";
  const marketProviderId = resolvedMarketProvider?.providerId ?? "disabled";
  const marketCapabilities = resolvedProvider === "twelve_data"
    ? TWELVE_DATA_CAPABILITIES
    : resolvedProvider === "yahoo"
      ? YAHOO_MARKET_CAPABILITIES
      : STOOQ_CAPABILITIES;

  return Response.json({
    secConfigured: Boolean(getSecUserAgent(env)),
    secUserAgentExplicit: Boolean(env.SEC_USER_AGENT?.trim()),
    marketProvider,
    marketProviderChain,
    providers: {
      fundamentals: { id: "sec-companyfacts", configured: Boolean(getSecUserAgent(env)), capabilities: SEC_CAPABILITIES },
      marketData: {
        id: marketProviderId,
        resolvedProvider,
        configured: marketConfigured,
        chain: marketProviderStatuses,
        capabilities: marketCapabilities
      }
    }
  });
}
