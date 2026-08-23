import { getMarketDataProvider, getSecUserAgent, getServerEnv } from "@/lib/env/server";
import { SEC_CAPABILITIES } from "@/lib/data/sec";
import { STOOQ_CAPABILITIES } from "@/lib/data/stooq";
import { TWELVE_DATA_CAPABILITIES } from "@/lib/data/twelve-data";

export const dynamic = "force-dynamic";

export function GET() {
  const env = getServerEnv();
  const marketProvider = getMarketDataProvider(env);
  const marketConfigured = marketProvider === "stooq" || (marketProvider === "twelve_data" && Boolean(env.TWELVE_DATA_API_KEY));
  const marketProviderId = marketProvider === "stooq" ? "stooq-eod" : marketProvider === "twelve_data" ? "twelve-data" : "disabled";
  const marketCapabilities = marketProvider === "twelve_data" ? TWELVE_DATA_CAPABILITIES : STOOQ_CAPABILITIES;

  return Response.json({
    secConfigured: Boolean(getSecUserAgent(env)),
    secUserAgentExplicit: Boolean(env.SEC_USER_AGENT?.trim()),
    marketProvider,
    providers: {
      fundamentals: { id: "sec-companyfacts", configured: Boolean(getSecUserAgent(env)), capabilities: SEC_CAPABILITIES },
      marketData: { id: marketProviderId, configured: marketConfigured, capabilities: marketCapabilities }
    }
  });
}
