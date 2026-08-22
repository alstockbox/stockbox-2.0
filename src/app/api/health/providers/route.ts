import { getMarketDataProvider, getSecUserAgent, getServerEnv } from "@/lib/env/server";
import { SEC_CAPABILITIES } from "@/lib/data/sec";
import { STOOQ_CAPABILITIES } from "@/lib/data/stooq";

export const dynamic = "force-dynamic";

export function GET() {
  const env = getServerEnv();
  const marketProvider = getMarketDataProvider(env);

  return Response.json({
    secConfigured: Boolean(getSecUserAgent(env)),
    secUserAgentExplicit: Boolean(env.SEC_USER_AGENT?.trim()),
    marketProvider,
    providers: {
      fundamentals: { id: "sec-companyfacts", configured: Boolean(getSecUserAgent(env)), capabilities: SEC_CAPABILITIES },
      marketData: { id: marketProvider === "stooq" ? "stooq-eod" : "disabled", configured: marketProvider === "stooq", capabilities: STOOQ_CAPABILITIES }
    }
  });
}
