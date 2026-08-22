import { getSecUserAgent, getServerEnv } from "@/lib/env/server";

export const dynamic = "force-dynamic";

export function GET() {
  const env = getServerEnv();

  return Response.json({
    secConfigured: Boolean(getSecUserAgent(env)),
    secUserAgentExplicit: Boolean(env.SEC_USER_AGENT?.trim()),
    marketProvider: env.MARKET_DATA_PROVIDER
  });
}
