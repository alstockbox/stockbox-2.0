import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { retryDurableBatchFailures } from "@/lib/batch/durable";
import { triggerDurableBatchWorker } from "@/lib/batch/worker-trigger";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to retry this batch." }, { status: 401 });
  const { id } = await context.params;
  try {
    const result = await retryDurableBatchFailures({ userId: user.id, batchId: id });
    if (result.queued) after(async () => { await triggerDurableBatchWorker({ baseUrl: new URL(request.url).origin }); });
    return Response.json({ ok: true, ...result });
  } catch {
    return Response.json({ error: "Failed batch items could not be queued." }, { status: 503 });
  }
}
