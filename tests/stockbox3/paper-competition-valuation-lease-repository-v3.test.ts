import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const sourcePath = path.join(
  process.cwd(),
  "src/lib/paper-trading/valuation-lease-repository-v3.ts",
);
const source = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, "utf8") : "";

describe("Paper Trading V3 valuation lease repository", () => {
  it("exports one server-only claim function and validates the competition UUID before the RPC", () => {
    expect(source).toContain("export async function claimPaperCompetitionValuationV3");
    expect(source).toContain("UUID_PATTERN.test(competitionId)");
    expect(source).toContain("PAPER_COMPETITION_VALUATION_CLAIM_INVALID_INPUT");
  });

  it("calls only the service-role claim RPC with the normalized competition identity", () => {
    expect(source).toContain("createAdminClient()");
    expect(source).toContain('.rpc("claim_paper_competition_valuation_v3"');
    expect(source).toContain("p_competition_id: competitionId");
    expect(source).not.toContain("p_now");
    expect(source).not.toContain("p_cooldown");
    expect(source).not.toContain("p_lease");
  });

  it("strictly parses a non-claimed result with a database timestamp and no lease token", () => {
    expect(source).toContain("claimed === false");
    expect(source).toContain("leaseToken === null");
    expect(source).toContain("leaseExpiresAt === null");
    expect(source).toContain("claimedAt");
  });

  it("requires claimed leases to carry a UUID token and valid future lease expiry", () => {
    expect(source).toContain("claimed === true");
    expect(source).toContain("UUID_PATTERN.test(leaseToken)");
    expect(source).toContain("Date.parse(leaseExpiresAt) > Date.parse(claimedAt)");
  });

  it("rejects malformed or ambiguous RPC payloads instead of guessing claim state", () => {
    expect(source).toContain("PAPER_COMPETITION_VALUATION_CLAIM_INVALID_RESULT");
    expect(source).toContain("Array.isArray(data) ? data[0] : data");
    expect(source).toContain("typeof raw !== \"object\"");
  });
});
