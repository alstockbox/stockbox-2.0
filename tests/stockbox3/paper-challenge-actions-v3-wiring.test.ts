import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const actionsPath = path.join(process.cwd(), "src/app/paper-trading/actions.ts");
const source = fs.readFileSync(actionsPath, "utf8");
const challengeActionStart = source.indexOf("export async function joinPaperChallengeAction");
const challengeActionEnd = source.indexOf("export async function executePaperOrderAction");
const challengeAction = challengeActionStart >= 0 && challengeActionEnd > challengeActionStart
  ? source.slice(challengeActionStart, challengeActionEnd)
  : "";

describe("Paper Trading V3 challenge action wiring", () => {
  it("authenticates before joining and never accepts a user id from FormData", () => {
    expect(challengeAction).toContain("export async function joinPaperChallengeAction");
    expect(challengeAction).toContain("const user = await requireUser()");
    expect(challengeAction).not.toContain('formData.get("userId")');
  });

  it("requires paper trading and challenges while respecting the paper kill switch", () => {
    expect(source).toContain('isFeatureEnabled("paperTrading")');
    expect(source).toContain('isFeatureEnabled("challenges")');
    expect(source).toContain('!isKilled("paperTrading")');
    expect(challengeAction).toContain("challengeAvailable()");
  });

  it("accepts only a UUID competition identity from the browser", () => {
    expect(source).toContain("const challengeJoinSchema = z.object");
    expect(source).toContain("competitionId: z.string().uuid()");
    expect(challengeAction).toContain('competitionId: formData.get("competitionId")');
    expect(challengeAction).not.toContain('formData.get("startingCash")');
    expect(challengeAction).not.toContain('formData.get("baseCurrency")');
    expect(challengeAction).not.toContain('formData.get("accountId")');
    expect(challengeAction).not.toContain('formData.get("inviteToken")');
  });

  it("uses only the challenge-hardened competition repository with the session user", () => {
    expect(source).toContain('from "@/lib/paper-trading/competition-repository-v3"');
    expect(challengeAction).toContain("joinPaperCompetitionV3(user.id, parsed.data.competitionId)");
  });

  it("revalidates the paper workspace and redirects without exposing repository errors", () => {
    expect(challengeAction).toContain('revalidatePath("/paper-trading")');
    expect(challengeAction).toContain("challengeStatus=joined");
    expect(challengeAction).toContain("challengeStatus=error");
    expect(challengeAction).not.toContain("result.error");
  });
});
