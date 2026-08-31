import { requireAdmin } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env/server";
import { runInvestorMonitoringCycle } from "@/lib/investor-intelligence/monitoring-worker";

function authorized(request: Request) {
  const secret = getServerEnv().CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const result = await runInvestorMonitoringCycle({ enqueueLimit: 250, batchSize: 10 });
  return Response.json(result, { status: result.ok ? 200 : 503 });
}

export async function POST() {
  await requireAdmin();
  const result = await runInvestorMonitoringCycle({ enqueueLimit: 250, batchSize: 10 });
  return Response.json(result, { status: result.ok ? 200 : 503 });
}
