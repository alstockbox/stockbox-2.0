import { isPayoutCronAuthorized } from "@/lib/affiliate/payouts";
import { requireAdmin } from "@/lib/auth/session";
import { refreshOfficialUsUniverse } from "@/lib/alpha/universe-repository";
import { getServerEnv } from "@/lib/env/server";

export const runtime = "nodejs";
export const maxDuration = 60;

async function run() {
  try {
    const result = await refreshOfficialUsUniverse();
    return Response.json(result, { status: result.ok ? 200 : 207 });
  } catch {
    return Response.json({ ok: false, error: "Alpha universe refresh is temporarily unavailable." }, { status: 503 });
  }
}

export async function GET(request: Request) {
  const secret = getServerEnv().CRON_SECRET;
  if (!isPayoutCronAuthorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  return run();
}

export async function POST() {
  await requireAdmin();
  return run();
}
