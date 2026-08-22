import { getCurrentUser } from "@/lib/auth/session";
import { fetchConfiguredMarketData } from "@/lib/data/provider";
import { getMarketDataProvider } from "@/lib/env/server";

export const dynamic = "force-dynamic";

const probeCompany = {
  ticker: "AAPL",
  name: "Apple Inc.",
  exchange: "NASDAQ",
  country: "US",
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "Forbidden." }, { status: 403 });

  const selectedProvider = getMarketDataProvider();
  const result = await fetchConfiguredMarketData(probeCompany);
  const observedAt = result.diagnostic.observedAt;

  return Response.json({
    provider: selectedProvider === "stooq" ? "stooq-eod" : "disabled",
    configured: selectedProvider === "stooq",
    status: result.ok ? "available" : "unavailable",
    reason: result.ok ? null : result.reason,
    testedSymbol: probeCompany.ticker,
    observedAt,
  });
}
