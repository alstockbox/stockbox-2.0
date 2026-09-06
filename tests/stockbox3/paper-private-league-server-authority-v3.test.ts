import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const inviteHelperPath = path.join(process.cwd(), "src/lib/paper-trading/private-league-invite-v3.ts");
const repositoryPath = path.join(process.cwd(), "src/lib/paper-trading/private-league-repository-v3.ts");
const actionsPath = path.join(process.cwd(), "src/app/paper-trading/actions.ts");

const readMaybe = (filePath: string) => fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
const inviteSource = readMaybe(inviteHelperPath);
const repositorySource = readMaybe(repositoryPath);
const actionsSource = readMaybe(actionsPath);

function actionSlice(name: string, nextName?: string): string {
  const start = actionsSource.indexOf(`export async function ${name}`);
  if (start < 0) return "";
  if (!nextName) return actionsSource.slice(start);
  const end = actionsSource.indexOf(`export async function ${nextName}`, start + 1);
  return end > start ? actionsSource.slice(start, end) : actionsSource.slice(start);
}

describe("Paper Trading V3 private league server authority", () => {
  it("generates high-entropy invite material only on the server and hashes it with SHA-256", () => {
    expect(inviteSource).toContain('import "server-only"');
    expect(inviteSource).toContain('randomBytes(32)');
    expect(inviteSource).toContain('.toString("base64url")');
    expect(inviteSource).toContain('createHash("sha256")');
    expect(inviteSource).toContain('digest("hex")');
    expect(inviteSource).toMatch(/[A-Za-z0-9_\\-].*43/);
    expect(inviteSource).not.toContain("console.");
  });

  it("keeps the join repository boundary to session user plus invite hash only", () => {
    const start = repositorySource.indexOf("export async function joinPrivatePaperLeagueV3");
    const end = repositorySource.indexOf("export async function createPrivatePaperLeagueInviteV3", start + 1);
    const join = start >= 0 ? repositorySource.slice(start, end > start ? end : undefined) : "";

    expect(join).toContain("joinPrivatePaperLeagueV3");
    expect(join).toContain('rpc("join_private_paper_league_v3"');
    expect(join).toContain("p_user_id: normalizedUserId");
    expect(join).toContain("p_invite_token_hash: normalizedInviteTokenHash");
    expect(join).not.toContain("competitionId");
    expect(join).not.toContain("accountId");
  });

  it("keeps all private league writes behind the service-role repository", () => {
    expect(repositorySource).toContain('createAdminClient');
    expect(repositorySource).toContain('rpc("create_private_paper_league_v3"');
    expect(repositorySource).toContain('rpc("join_private_paper_league_v3"');
    expect(repositorySource).toContain('rpc("create_private_paper_league_invite_v3"');
    expect(repositorySource).toContain('rpc("revoke_private_paper_league_invite_v3"');
    expect(repositorySource).toContain('rpc("set_private_paper_league_member_role_v3"');
    expect(repositorySource).not.toContain("createClient(");
  });

  it("dark-gates every private league action behind paper trading, private leagues and the paper kill switch", () => {
    expect(actionsSource).toContain("function privateLeagueAvailable(): boolean");
    expect(actionsSource).toContain('isFeatureEnabled("paperTrading")');
    expect(actionsSource).toContain('isFeatureEnabled("privateLeagues")');
    expect(actionsSource).toContain('!isKilled("paperTrading")');
  });

  it("accepts only the raw invite token from the browser when joining and derives the user server-side", () => {
    const join = actionSlice("joinPrivatePaperLeagueAction", "createPrivatePaperLeagueAction");
    expect(join).toContain("const user = await requireUser()");
    expect(join).toContain('inviteToken: formData.get("inviteToken")');
    expect(join).toContain("hashPrivateLeagueInviteTokenV3(parsed.data.inviteToken)");
    expect(join).toContain("joinPrivatePaperLeagueV3(user.id, inviteTokenHash)");
    expect(join).not.toContain('formData.get("userId")');
    expect(join).not.toContain('formData.get("competitionId")');
    expect(join).not.toContain('formData.get("accountId")');
  });

  it("creates a league with server-owned identity and server-generated invite material", () => {
    const create = actionSlice("createPrivatePaperLeagueAction", "createPrivatePaperLeagueInviteAction");
    expect(create).toContain("const user = await requireUser()");
    expect(create).toContain("generatePrivateLeagueInviteTokenV3()");
    expect(create).toContain("hashPrivateLeagueInviteTokenV3(inviteToken)");
    expect(create).toContain("ownerUserId: user.id");
    expect(create).not.toContain('formData.get("userId")');
    expect(create).not.toContain('formData.get("accountId")');
    expect(create).toContain("inviteToken");
    expect(create).not.toMatch(/redirect\([^\n]*inviteToken/);
  });

  it("creates additional invites from server-generated tokens and never accepts a browser hash", () => {
    const createInvite = actionSlice("createPrivatePaperLeagueInviteAction", "revokePrivatePaperLeagueInviteAction");
    expect(createInvite).toContain("const user = await requireUser()");
    expect(createInvite).toContain('competitionId: formData.get("competitionId")');
    expect(createInvite).toContain('expiresAt: formData.get("expiresAt")');
    expect(createInvite).toContain("generatePrivateLeagueInviteTokenV3()");
    expect(createInvite).toContain("hashPrivateLeagueInviteTokenV3(inviteToken)");
    expect(createInvite).toContain("actorUserId: user.id");
    expect(createInvite).not.toContain('formData.get("inviteTokenHash")');
    expect(createInvite).not.toContain('formData.get("userId")');
    expect(createInvite).not.toContain('formData.get("accountId")');
  });

  it("derives revoke and role-management actor identity from the authenticated session", () => {
    const revoke = actionSlice("revokePrivatePaperLeagueInviteAction", "setPrivatePaperLeagueMemberRoleAction");
    const role = actionSlice("setPrivatePaperLeagueMemberRoleAction");
    expect(revoke).toContain("const user = await requireUser()");
    expect(revoke).toContain("actorUserId: user.id");
    expect(revoke).not.toContain('formData.get("userId")');
    expect(revoke).not.toContain('formData.get("accountId")');
    expect(role).toContain("const user = await requireUser()");
    expect(role).toContain("actorUserId: user.id");
    expect(role).not.toContain('formData.get("actorUserId")');
    expect(role).not.toContain('formData.get("accountId")');
  });

  it("does not expose raw invite material through logs or URL query construction", () => {
    expect(actionsSource).not.toContain("console.log(inviteToken");
    expect(actionsSource).not.toContain("console.info(inviteToken");
    expect(actionsSource).not.toContain("console.error(inviteToken");
    expect(actionsSource).not.toMatch(/[?&]inviteToken=/);
    expect(repositorySource).not.toContain("console.");
  });
});
