import { isPayoutCronAuthorized } from "@/lib/affiliate/payouts";
import { runAlphaUniverseScan } from "@/lib/alpha/scanner";
import { getServerEnv } from "@/lib/env/server";

export const runtime = "nodejs";
export const maxDuration = 300;

async function run(request: Request) {
  const secret = getServerEnv().CRON_SECRET;
  if (!isPayoutCronAuthorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await runAlphaUniverseScan();
    return Response.json(result, { status: result.ok ? 200 : 207 });
  } catch {
    return Response.json(
      { ok: false, error: "Alpha scanner is temporarily unavailable." },
      { status: 503 },
    );
  }
}

export const GET = run;
export const POST = run;
