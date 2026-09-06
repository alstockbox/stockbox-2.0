import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const actionsPath = path.join(process.cwd(), "src/app/paper-trading/actions.ts");
const source = fs.readFileSync(actionsPath, "utf8");

describe("Paper Trading V3 challenge action wiring", () => {
  it("authenticates before joining and never accepts a user id from FormData", () => {
    expect(source).toContain("export async function joinPaperChallengeAction");
    expect(source).toContain("const user = await requireUser()");
    expect(source).not.toContain('formData.get("userId")');
  });

  it("requires paper trading and challenges while respecting the paper kill switch", () => {
    expect(source).toContain('isFeatureEnabled("paperTrading")');
    expect(source).toContain('isFeatureEnabled("challenges")');
    expect(source).toContain('!isKilled("paperTrading")');
    expect(source).toContain("challengeAvailable()");
  });

  it("accepts only a UUID competition identity from the browser", () => {
    expect(source).toContain("const challengeJoinSchema = z.object");
    expect(source).toContain("competitionId: z.string().uuid()");
    expect(source).toContain('competitionId: formData.get("competitionId")');
    expect(source).not.toContain('formData.get("startingCash")');
    expect(source).not.toContain('formData.get("baseCurrency")');
    expect(source).not.toContain('formData.get("accountId")');
    expect(source).not.toContain('formData.get("inviteToken")');
  });

  it("uses only the challenge-hardened competition repository with the session user", () => {
    expect(source).toContain('from "@/lib/paper-trading/competition-repository-v3"');
    expect(source).toContain("joinPaperCompetitionV3(user.id, parsed.data.competitionId)");
  });

  it("revalidates the paper workspace and redirects without exposing repository errors", () => {
    expect(source).toContain('revalidatePath("/paper-trading")');
    expect(source).toContain("challengeStatus=joined");
    expect(source).toContain("challengeStatus=error");
    expect(source).not.toContain("result.error");
  });
});
