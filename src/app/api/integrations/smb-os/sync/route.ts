import { isPayoutCronAuthorized } from "@/lib/affiliate/payouts";
import { getServerEnv } from "@/lib/env/server";
import { runSmbOsSync } from "@/lib/integrations/smb-os-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = getServerEnv().CRON_SECRET;
  if (!isPayoutCronAuthorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await runSmbOsSync();
    return Response.json({ ok: result.failed === 0, ...result }, { status: result.failed === 0 ? 200 : 207 });
  } catch {
    return Response.json({ ok: false, error: "SMB OS sync is temporarily unavailable." }, { status: 503 });
  }
}
