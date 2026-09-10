import { requireAdmin } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env/server";
import { runDurableWatchlistMonitoring } from "@/lib/monitoring/jobs";
import { isCronAuthorized } from "@/lib/server/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = getServerEnv().CRON_SECRET;
  if (!isCronAuthorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await runDurableWatchlistMonitoring();
    return Response.json(
      { ok: result.failed === 0, ...result },
      { status: result.failed === 0 ? 200 : 207 },
    );
  } catch {
    return Response.json(
      { ok: false, error: "Watchlist monitoring is temporarily unavailable." },
      { status: 503 },
    );
  }
}

export async function POST() {
  await requireAdmin();
  try {
    const result = await runDurableWatchlistMonitoring({ enqueueLimit: 500, workerLimit: 50 });
    return Response.json(
      { ok: result.failed === 0, ...result },
      { status: result.failed === 0 ? 200 : 207 },
    );
  } catch {
    return Response.json(
      { ok: false, error: "Watchlist monitoring is temporarily unavailable." },
      { status: 503 },
    );
  }
}
