import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDurableBatchRun } from "@/lib/batch/durable";
import { triggerDurableBatchWorker } from "@/lib/batch/worker-trigger";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to view this batch." }, { status: 401 });
  const { id } = await context.params;
  const batch = await getDurableBatchRun({ userId: user.id, batchId: id });
  if (!batch) return Response.json({ error: "Batch not found." }, { status: 404 });

  const hasQueuedItems = batch.items.some((item) => item.status === "queued");
  const hasProcessingItems = batch.items.some((item) => item.status === "processing");
  if (hasQueuedItems && !hasProcessingItems) {
    const baseUrl = new URL(request.url).origin;
    after(async () => { await triggerDurableBatchWorker({ baseUrl }); });
  }

  return Response.json({ ok: true, ...batch }, { headers: { "Cache-Control": "no-store" } });
}
