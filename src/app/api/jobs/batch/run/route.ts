import { after } from "next/server";
import { isPayoutCronAuthorized } from "@/lib/affiliate/payouts";
import { nextDurableBatchWorkerDelayMs, runDurableBatchJobs } from "@/lib/batch/durable";
import { triggerDurableBatchWorker } from "@/lib/batch/worker-trigger";
import { getServerEnv } from "@/lib/env/server";

export const runtime = "nodejs";
export const maxDuration = 300;

async function run(request: Request) {
  const secret = getServerEnv().CRON_SECRET;
  if (!isPayoutCronAuthorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await runDurableBatchJobs(1);
    const nextDelayMs = await nextDurableBatchWorkerDelayMs();
    if (nextDelayMs !== null) {
      const baseUrl = new URL(request.url).origin;
      after(async () => { await triggerDurableBatchWorker({ baseUrl, delayMs: nextDelayMs }); });
    }
    return Response.json({ ok: result.failed === 0, ...result }, { status: result.failed === 0 ? 200 : 207 });
  } catch {
    return Response.json({ ok: false, error: "Batch worker is temporarily unavailable." }, { status: 503 });
  }
}

export const GET = run;
export const POST = run;
