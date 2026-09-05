import { BATCH_ANALYSIS_JOB_KIND, batchJobDedupeKey } from "@/lib/batch/durable";
import { cancelQueuedBackgroundJobsByDedupeKeys } from "@/lib/jobs/background-jobs";
import { createAdminClient } from "@/lib/supabase/admin";

export async function cancelQueuedBatchJobsForBatch(input: {
  userId: string;
  batchId: string;
}): Promise<number> {
  const admin = createAdminClient();
  if (!admin) return 0;

  const { data, error } = await admin.from("batch_items")
    .select("id")
    .eq("batch_id", input.batchId)
    .eq("user_id", input.userId)
    .eq("status", "cancelled");
  if (error || !data?.length) return 0;

  return cancelQueuedBackgroundJobsByDedupeKeys({
    kind: BATCH_ANALYSIS_JOB_KIND,
    dedupeKeys: data.map((row) => batchJobDedupeKey(String(row.id))),
  });
}
