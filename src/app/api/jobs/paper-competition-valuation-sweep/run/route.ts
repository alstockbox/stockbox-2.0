import { isPayoutCronAuthorized } from "@/lib/affiliate/payouts";
import { getServerEnv } from "@/lib/env/server";
import { runPaperCompetitionValuationRuntimeV3 } from "@/lib/paper-trading/competition-valuation-runtime-v3";

export const runtime = "nodejs";
export const maxDuration = 300;

async function run(request: Request) {
  const secret = getServerEnv().CRON_SECRET;
  if (!isPayoutCronAuthorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let result: Awaited<ReturnType<typeof runPaperCompetitionValuationRuntimeV3>>;
  try {
    result = await runPaperCompetitionValuationRuntimeV3();
  } catch {
    return Response.json({ status: "ERROR" }, { status: 503 });
  }

  const status = result.status === "ERROR"
    ? 503
    : result.status === "COMPLETED" && result.errors > 0
      ? 207
      : 200;

  return Response.json(result, { status });
}

export const GET = run;
export const POST = run;
