import { getSecUserAgent, getServerEnv } from "@/lib/env/server";
import { SEC_CAPABILITIES } from "@/lib/data/sec";
import { STOOQ_CAPABILITIES } from "@/lib/data/stooq";

export const dynamic = "force-dynamic";

export function GET() {
  const env = getServerEnv();

  return Response.json({
    secConfigured: Boolean(getSecUserAgent(env)),
    secUserAgentExplicit: Boolean(env.SEC_USER_AGENT?.trim()),
    marketProvider: env.MARKET_DATA_PROVIDER,
    providers: {
      fundamentals: { id: "sec-companyfacts", configured: Boolean(getSecUserAgent(env)), capabilities: SEC_CAPABILITIES },
      marketData: { id: "stooq-eod", configured: env.MARKET_DATA_PROVIDER === "stooq", capabilities: STOOQ_CAPABILITIES }
    }
  });
}
