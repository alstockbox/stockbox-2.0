import { isPayoutCronAuthorized } from "@/lib/affiliate/payouts";
import { collectMaturedAlphaOutcomes } from "@/lib/alpha/outcome-collector";
import { requireAdmin } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function requestedLimit(request: Request, fallback: number) {
  const url = new URL(request.url);
  const value = Number(url.searchParams.get("limit") ?? fallback);
  return Number.isFinite(value) ? Math.min(100, Math.max(1, Math.floor(value))) : fallback;
}

async function run(limit: number) {
  try {
    const result = await collectMaturedAlphaOutcomes({ limit, maxLagDays: 7 });
    return Response.json(result, { status: result.ok ? 200 : result.recorded > 0 ? 207 : 503 });
  } catch {
    return Response.json({ ok: false, error: "Alpha outcome collection is temporarily unavailable." }, { status: 503 });
  }
}

export async function GET(request: Request) {
  const secret = getServerEnv().CRON_SECRET;
  if (!isPayoutCronAuthorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  return run(requestedLimit(request, 20));
}

export async function POST(request: Request) {
  await requireAdmin();
  return run(requestedLimit(request, 50));
}
