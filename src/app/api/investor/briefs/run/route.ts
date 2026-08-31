import { requireAdmin } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env/server";
import { generateWeeklyBriefs } from "@/lib/investor-intelligence/weekly-brief-service";

function authorized(request: Request) {
  const secret = getServerEnv().CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const result = await generateWeeklyBriefs();
  return Response.json(result, { status: result.ok ? 200 : 503 });
}

export async function POST() {
  await requireAdmin();
  const result = await generateWeeklyBriefs();
  return Response.json(result, { status: result.ok ? 200 : 503 });
}
