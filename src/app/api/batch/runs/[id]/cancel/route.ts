import { getCurrentUser } from "@/lib/auth/session";
import { cancelDurableBatch } from "@/lib/batch/durable";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to cancel this batch." }, { status: 401 });
  const { id } = await context.params;
  try {
    const result = await cancelDurableBatch({ userId: user.id, batchId: id });
    return Response.json({ ok: true, ...result });
  } catch {
    return Response.json({ error: "The batch could not be cancelled." }, { status: 503 });
  }
}
