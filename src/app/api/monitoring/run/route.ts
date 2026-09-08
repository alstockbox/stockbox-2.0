import { isPayoutCronAuthorized } from "@/lib/affiliate/payouts";
import { requireAdmin } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env/server";
import {
  monitoringCycleHttpStatusV3,
  runMonitoringCycleV3,
} from "@/lib/monitoring/monitoring-cycle-v3";

export const runtime = "nodejs";
export const maxDuration = 60;

function monitoringResponse(result: Awaited<ReturnType<typeof runMonitoringCycleV3>>) {
  return Response.json(result, { status: monitoringCycleHttpStatusV3(result) });
}

export async function GET(request: Request) {
  const secret = getServerEnv().CRON_SECRET;
  if (!isPayoutCronAuthorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    return monitoringResponse(await runMonitoringCycleV3());
  } catch {
    return Response.json(
      { ok: false, error: "Monitoring cycle is temporarily unavailable." },
      { status: 503 },
    );
  }
}

export async function POST() {
  await requireAdmin();
  try {
    return monitoringResponse(await runMonitoringCycleV3({
      watchlistOptions: { enqueueLimit: 500, workerLimit: 50 },
      recommendationOutcomeOptions: { enqueueLimit: 500, workerLimit: 50 },
    }));
  } catch {
    return Response.json(
      { ok: false, error: "Monitoring cycle is temporarily unavailable." },
      { status: 503 },
    );
  }
}
