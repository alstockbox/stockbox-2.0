import { getCurrentUser } from "@/lib/auth/session";
import { configuredMarketDataProviderStatuses, smokeConfiguredMarketData } from "@/lib/data/provider";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized." }, { status: 401 });
  if (user.role !== "admin") return Response.json({ error: "Forbidden." }, { status: 403 });

  const providerChain = configuredMarketDataProviderStatuses();
  const probes = await smokeConfiguredMarketData();

  return Response.json({
    providerChain,
    configured: providerChain.some((provider) => provider.configured),
    status: probes.some((probe) => probe.status === "available") ? "available" : "unavailable",
    probes,
    observedAt: new Date().toISOString(),
  });
}
