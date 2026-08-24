import { getMarketDataProvider, getMarketDataProviderChain, getSecUserAgent, getServerEnv } from "@/lib/env/server";
import { SEC_CAPABILITIES } from "@/lib/data/sec";
import { STOOQ_CAPABILITIES } from "@/lib/data/stooq";
import { TWELVE_DATA_CAPABILITIES } from "@/lib/data/twelve-data";
import { configuredMarketDataProviderStatuses } from "@/lib/data/provider";

export const dynamic = "force-dynamic";

export function GET() {
  const env = getServerEnv();
  const marketProvider = getMarketDataProvider(env);
  const marketProviderChain = getMarketDataProviderChain(env);
  const marketProviderStatuses = configuredMarketDataProviderStatuses(env);
  const marketConfigured = marketProviderStatuses.some((provider) => provider.configured);
  const marketProviderId = marketProvider === "stooq" ? "stooq-eod" : marketProvider === "twelve_data" ? "twelve-data" : "disabled";
  const marketCapabilities = marketProvider === "twelve_data" ? TWELVE_DATA_CAPABILITIES : STOOQ_CAPABILITIES;

  return Response.json({
    secConfigured: Boolean(getSecUserAgent(env)),
    secUserAgentExplicit: Boolean(env.SEC_USER_AGENT?.trim()),
    marketProvider,
    marketProviderChain,
    providers: {
      fundamentals: { id: "sec-companyfacts", configured: Boolean(getSecUserAgent(env)), capabilities: SEC_CAPABILITIES },
      marketData: {
        id: marketProviderId,
        configured: marketConfigured,
        chain: marketProviderStatuses,
        capabilities: marketCapabilities
      }
    }
  });
}
