import { createHash } from "node:crypto";
import { fetchBolagsverketAnnualReportEvidence } from "@/lib/data/bolagsverket";
import { getServerEnv } from "@/lib/env/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPECTED_TOKEN_HASH = "942ddc3d60c3b13f5dd6a15f663b3446133179f47ccd7c36e8860a3b8e355963";
const TEST_ORGANIZATION_NUMBER = "5560138298";

function tokenMatches(token: string | null) {
  if (!token) return false;
  return createHash("sha256").update(token).digest("hex") === EXPECTED_TOKEN_HASH;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!tokenMatches(url.searchParams.get("token"))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const env = getServerEnv();
  const configured = Boolean(
    env.BOLAGSVERKET_CLIENT_ID?.trim()
      && env.BOLAGSVERKET_CLIENT_SECRET?.trim()
      && env.BOLAGSVERKET_TOKEN_URL?.trim()
      && env.BOLAGSVERKET_BASE_URL?.trim(),
  );

  if (!configured) {
    return Response.json({ ok: false, stage: "configuration", reason: "missing_required_environment" }, { status: 503 });
  }

  const result = await fetchBolagsverketAnnualReportEvidence(
    TEST_ORGANIZATION_NUMBER,
    {
      clientId: env.BOLAGSVERKET_CLIENT_ID!,
      clientSecret: env.BOLAGSVERKET_CLIENT_SECRET!,
      tokenUrl: env.BOLAGSVERKET_TOKEN_URL!,
      baseUrl: env.BOLAGSVERKET_BASE_URL!,
      scope: env.BOLAGSVERKET_SCOPE,
    },
  );

  if (!result.ok) {
    return Response.json({ ok: false, stage: "bolagsverket", reason: result.reason, diagnostic: result.diagnostic }, { status: 503 });
  }

  return Response.json({
    ok: true,
    stage: "complete",
    documents: result.data.data.documents.length,
    dataAsOf: result.data.dataAsOf,
    diagnostic: result.diagnostic,
  });
}
