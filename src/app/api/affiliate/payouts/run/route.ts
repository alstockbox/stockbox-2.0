import { isPayoutCronAuthorized, runScheduledAffiliatePayouts } from "@/lib/affiliate/payouts";
import { requireAdmin } from "@/lib/auth/session";
import { getServerEnv } from "@/lib/env/server";

function payoutSummary(result: Awaited<ReturnType<typeof runScheduledAffiliatePayouts>>) {
  return {
    ok: result.ok,
    processed: result.results.length,
    paid: result.results.filter((item) => item.status === "paid").length,
    failed: result.results.filter((item) =>
      item.status === "failed" || item.status === "reconciliation_required"
    ).length,
    skipped: result.results.filter((item) =>
      item.status !== "paid" && item.status !== "failed" && item.status !== "reconciliation_required"
    ).length,
  };
}

export async function GET(request: Request) {
  const secret = getServerEnv().CRON_SECRET;
  if (!isPayoutCronAuthorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await runScheduledAffiliatePayouts();
  return Response.json(payoutSummary(result), { status: result.ok ? 200 : 503 });
}

export async function POST() {
  await requireAdmin();
  const result = await runScheduledAffiliatePayouts();
  return Response.json({ ...payoutSummary(result), results: result.results }, {
    status: result.ok ? 200 : 503,
  });
}
