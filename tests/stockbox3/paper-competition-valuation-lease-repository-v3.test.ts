import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const sourcePath = path.join(
  process.cwd(),
  "src/lib/paper-trading/valuation-lease-repository-v3.ts",
);
const source = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, "utf8") : "";
const claimStart = source.indexOf("export async function claimPaperCompetitionValuationV3");
const completionStart = source.indexOf("export async function completePaperCompetitionValuationV3");
const claimSource = claimStart >= 0
  ? source.slice(claimStart, completionStart >= 0 ? completionStart : undefined)
  : "";

describe("Paper Trading V3 valuation lease repository", () => {
  it("exports one server-only claim function and validates the competition UUID before the RPC", () => {
    expect(claimSource).toContain("export async function claimPaperCompetitionValuationV3");
    expect(claimSource).toContain("UUID_PATTERN.test(competitionId)");
    expect(claimSource).toContain("PAPER_COMPETITION_VALUATION_CLAIM_INVALID_INPUT");
  });

  it("calls only the service-role claim RPC with the normalized competition identity", () => {
    expect(claimSource).toContain("createAdminClient()");
    expect(claimSource).toContain('.rpc("claim_paper_competition_valuation_v3"');
    expect(claimSource).toContain("p_competition_id: competitionId");
    expect(claimSource).not.toContain("p_now");
    expect(claimSource).not.toContain("p_cooldown");
    expect(claimSource).not.toContain("p_lease");
  });

  it("strictly parses a non-claimed result with a database timestamp and no lease token", () => {
    expect(claimSource).toContain("claimed === false");
    expect(claimSource).toContain("leaseToken === null");
    expect(claimSource).toContain("leaseExpiresAt === null");
    expect(claimSource).toContain("claimedAt");
  });

  it("requires claimed leases to carry a UUID token and valid future lease expiry", () => {
    expect(claimSource).toContain("claimed === true");
    expect(claimSource).toContain("UUID_PATTERN.test(leaseToken)");
    expect(claimSource).toContain("Date.parse(leaseExpiresAt) > Date.parse(claimedAt)");
  });

  it("rejects malformed or ambiguous RPC payloads instead of guessing claim state", () => {
    expect(claimSource).toContain("PAPER_COMPETITION_VALUATION_CLAIM_INVALID_RESULT");
    expect(claimSource).toContain("Array.isArray(data) ? data[0] : data");
    expect(claimSource).toContain("typeof raw !== \"object\"");
  });
});
