import { after } from "next/server";
import { isPayoutCronAuthorized } from "@/lib/affiliate/payouts";
import { nextDurableBatchWorkerDelayMs, runDurableBatchJobs } from "@/lib/batch/durable";
import { recoverStaleBatchItems } from "@/lib/batch/stale-recovery";
import {
  BATCH_WORKER_RECOVERY_ATTEMPT_HEADER,
  nextDurableWorkerRecoveryDelayMs,
  triggerDurableBatchWorker,
} from "@/lib/batch/worker-trigger";
import { getServerEnv } from "@/lib/env/server";

export const runtime = "nodejs";
export const maxDuration = 300;

function workerRecoveryAttempt(request: Request): number {
  const value = Number.parseInt(request.headers.get(BATCH_WORKER_RECOVERY_ATTEMPT_HEADER) ?? "0", 10);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function scheduleWorkerRecovery(baseUrl: string, recoveryAttempt: number): boolean {
  const recoveryDelayMs = nextDurableWorkerRecoveryDelayMs(recoveryAttempt);
  if (recoveryDelayMs === null) return false;
  after(async () => {
    await triggerDurableBatchWorker({
      baseUrl,
      delayMs: recoveryDelayMs,
      recoveryAttempt: recoveryAttempt + 1,
    });
  });
  return true;
}

async function run(request: Request) {
  const secret = getServerEnv().CRON_SECRET;
  if (!isPayoutCronAuthorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const recoveryAttempt = workerRecoveryAttempt(request);
  const baseUrl = new URL(request.url).origin;
  try {
    const recovery = await recoverStaleBatchItems({ strict: true });
    const result = await runDurableBatchJobs(3);
    const nextDelayMs = await nextDurableBatchWorkerDelayMs();
    if (nextDelayMs !== null) {
      after(async () => { await triggerDurableBatchWorker({ baseUrl, delayMs: nextDelayMs }); });
    } else if (recoveryAttempt > 0 && result.claimed === 0) {
      scheduleWorkerRecovery(baseUrl, recoveryAttempt);
    }
    return Response.json(
      { ok: result.failed === 0, recovery, ...result },
      { status: result.failed === 0 ? 200 : 207 },
    );
  } catch {
    scheduleWorkerRecovery(baseUrl, recoveryAttempt);
    return Response.json({ ok: false, error: "Batch worker is temporarily unavailable." }, { status: 503 });
  }
}

export const GET = run;
export const POST = run;
