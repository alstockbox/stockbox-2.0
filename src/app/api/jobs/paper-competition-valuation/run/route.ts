import { isPayoutCronAuthorized } from "@/lib/affiliate/payouts";
import { getServerEnv } from "@/lib/env/server";
import {
  parsePaperCompetitionValuationJobInputV3,
  runPaperCompetitionValuationJobV3,
} from "@/lib/paper-trading/competition-valuation-job-v3";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const secret = getServerEnv().CRON_SECRET;
  if (!isPayoutCronAuthorized(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = parsePaperCompetitionValuationJobInputV3(body);
  if (!parsed.ok) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = await runPaperCompetitionValuationJobV3(parsed.input);
  const status = result.status === "ERROR"
    ? 503
    : result.status === "INVALID_INPUT"
      ? 400
      : 200;

  return Response.json(result, { status });
}
