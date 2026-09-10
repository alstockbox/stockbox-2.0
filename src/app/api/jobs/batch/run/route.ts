import { after } from "next/server";
import { nextDurableBatchWorkerDelayMs } from "@/lib/batch/durable";
import { recoverStaleBatchItems } from "@/lib/batch/stale-recovery";
import { triggerDurableBatchWorker } from "@/lib/batch/worker-trigger";
import { runDurableBatchWorkerWave } from "@/lib/batch/worker-wave";
import { getServerEnv } from "@/lib/env/server";
import { isCronAuthorized } from "@/lib/server/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

async function run(request: Request) {
  const secret = getServerEnv().CRON_SECRET;
  if (!isCronAuthorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const recovery = await recoverStaleBatchItems();
    const result = await runDurableBatchWorkerWave();
    const nextDelayMs = await nextDurableBatchWorkerDelayMs();
    if (nextDelayMs !== null) {
      const baseUrl = new URL(request.url).origin;
      after(async () => { await triggerDurableBatchWorker({ baseUrl, delayMs: nextDelayMs }); });
    }
    return Response.json(
      { ok: result.failed === 0, recovery, ...result },
      { status: result.failed === 0 ? 200 : 207 },
    );
  } catch {
    return Response.json({ ok: false, error: "Batch worker is temporarily unavailable." }, { status: 503 });
  }
}

export const GET = run;
export const POST = run;
