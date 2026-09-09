import {
  BATCH_ANALYSIS_JOB_KIND,
  BATCH_ORCHESTRATION_CONCURRENCY,
  handleBatchAnalysisJob,
} from "@/lib/batch/durable";
import { runBackgroundJobs } from "@/lib/jobs/background-jobs";

export const BATCH_WORKER_CLAIM_LIMIT = BATCH_ORCHESTRATION_CONCURRENCY;

export async function runDurableBatchWorkerWave() {
  return runBackgroundJobs({
    kinds: [BATCH_ANALYSIS_JOB_KIND],
    limit: BATCH_WORKER_CLAIM_LIMIT,
    staleAfterMinutes: 5,
    handlers: { [BATCH_ANALYSIS_JOB_KIND]: handleBatchAnalysisJob },
  });
}
