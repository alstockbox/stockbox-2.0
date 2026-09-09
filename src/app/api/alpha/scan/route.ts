import { isPayoutCronAuthorized } from "@/lib/affiliate/payouts";
import { requireAdmin } from "@/lib/auth/session";
import { runAlphaUniverseScan } from "@/lib/alpha/scanner";
import { getServerEnv } from "@/lib/env/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function requestedLimit(request: Request, fallback: number) {
  const url = new URL(request.url);
  const value = Number(url.searchParams.get("limit") ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(50, Math.max(1, Math.floor(value)));
}

async function run(limit: number) {
  try {
    const result = await runAlphaUniverseScan({ limit, refreshAfterHours: 24 });
    return Response.json(result, { status: result.ok ? 200 : result.predictions > 0 ? 207 : 503 });
  } catch {
    return Response.json({ ok: false, error: "Alpha universe scan is temporarily unavailable." }, { status: 503 });
  }
}

export async function GET(request: Request) {
  const secret = getServerEnv().CRON_SECRET;
  if (!isPayoutCronAuthorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  return run(requestedLimit(request, 3));
}

export async function POST(request: Request) {
  await requireAdmin();
  return run(requestedLimit(request, 10));
}
