import { getCurrentUser } from "@/lib/auth/session";
import { getDurableBatchRun } from "@/lib/batch/durable";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to view this batch." }, { status: 401 });
  const { id } = await context.params;
  const batch = await getDurableBatchRun({ userId: user.id, batchId: id });
  if (!batch) return Response.json({ error: "Batch not found." }, { status: 404 });
  return Response.json({ ok: true, ...batch }, { headers: { "Cache-Control": "no-store" } });
}
