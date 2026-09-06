import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readMaybe = (filePath: string) => fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";

const readRepository = readMaybe(path.join(process.cwd(), "src/lib/paper-trading/private-league-read-repository-v3.ts"));
const workspacePage = readMaybe(path.join(process.cwd(), "src/app/paper-trading/private-leagues/[competitionId]/page.tsx"));
const managementPage = readMaybe(path.join(process.cwd(), "src/app/paper-trading/private-leagues/[competitionId]/manage/page.tsx"));
const managementForms = readMaybe(path.join(process.cwd(), "src/app/paper-trading/private-leagues/[competitionId]/manage/management-forms.tsx"));
const managementActions = readMaybe(path.join(process.cwd(), "src/app/paper-trading/private-leagues/[competitionId]/manage/actions.ts"));

function block(source: string, signature: string, nextSignature?: string): string {
  const start = source.indexOf(signature);
  if (start < 0) return "";
  if (!nextSignature) return source.slice(start);
  const end = source.indexOf(nextSignature, start + signature.length);
  return source.slice(start, end >= 0 ? end : source.length);
}

const memberReader = block(readRepository, "export async function listPrivatePaperLeagueMembersV3");

describe("Paper Trading V3 private league management surface", () => {
  it("keeps the management route dark-gated, authenticated, and owner/admin-only", () => {
    expect(managementPage).toContain('isFeatureEnabled("paperTrading")');
    expect(managementPage).toContain('isFeatureEnabled("privateLeagues")');
    expect(managementPage).toContain("notFound()");
    expect(managementPage).toContain("requireUser()");
    expect(managementPage).toContain("loadPrivatePaperLeagueWorkspaceV3(user.id, competitionId)");
    expect(managementPage).toContain('workspace.role !== "owner" && workspace.role !== "admin"');
    expect(managementPage).not.toContain("searchParams");
  });

  it("lists league members only after owner/admin membership authorization and never queries identity directories", () => {
    expect(readRepository).toContain("export async function listPrivatePaperLeagueMembersV3");
    expect(memberReader).toContain('.from("paper_private_league_members_v3")');
    expect(memberReader).toContain('.eq("competition_id", normalizedCompetitionId)');
    expect(memberReader).toContain('.eq("user_id", normalizedUserId)');
    expect(memberReader).toContain('role !== "owner" && role !== "admin"');
    expect(memberReader).toContain('select("competition_id,user_id,role")');
    expect(memberReader).toContain("PRIVATE_LEAGUE_MEMBER_PAGE_SIZE");
    expect(memberReader).toContain("seenUserIds");
    expect(memberReader).toContain("ownerCount");
    expect(memberReader).not.toContain("auth.users");
    expect(memberReader).not.toContain("email");
  });

  it("loads only sanitized invite metadata and scoped members after the management role is verified", () => {
    const roleGuard = managementPage.indexOf('workspace.role !== "owner" && workspace.role !== "admin"');
    const invitesRead = managementPage.indexOf("listPrivatePaperLeagueInvitesV3(user.id, workspace.competition.id)");
    const membersRead = managementPage.indexOf("listPrivatePaperLeagueMembersV3(user.id, workspace.competition.id)");
    expect(roleGuard).toBeGreaterThanOrEqual(0);
    expect(invitesRead).toBeGreaterThan(roleGuard);
    expect(membersRead).toBeGreaterThan(roleGuard);
    expect(managementPage).not.toContain("invite_token_hash");
    expect(managementPage).not.toContain("rawToken");
  });

  it("keeps management read-only under the paper kill switch even though metadata remains visible", () => {
    expect(managementPage).toContain('isKilled("paperTrading")');
    expect(managementPage).toContain("mutationsEnabled");
    expect(managementPage).toContain("<PrivateLeagueManagementForms");
    expect(managementPage).toContain("mutationsEnabled ?");
  });

  it("uses action-state forms backed by thin server adapters for invite create/revoke and owner-only role changes", () => {
    expect(managementForms).toContain('"use client"');
    expect(managementForms).toContain("useActionState");
    expect(managementForms).toContain("createPrivateLeagueManagementInviteAction");
    expect(managementForms).toContain("revokePrivateLeagueManagementInviteAction");
    expect(managementForms).toContain("setPrivateLeagueManagementMemberRoleAction");
    expect(managementForms).toContain('name="competitionId"');
    expect(managementForms).toContain('name="expiresAt"');
    expect(managementForms).toContain('name="inviteId"');
    expect(managementForms).toContain('name="memberUserId"');
    expect(managementForms).toContain('name="role"');
    expect(managementForms).toContain("canEditRoles");
  });

  it("shows newly generated invite material only once in action state and never persists it in browser state or URLs", () => {
    expect(managementForms).toContain('createState.status === "created"');
    expect(managementForms).toContain("createState.inviteToken");
    expect(managementForms).toContain("visas bara i detta svar");
    expect(managementForms).not.toContain("localStorage");
    expect(managementForms).not.toContain("sessionStorage");
    expect(managementForms).not.toMatch(/[?&]inviteToken=/);
    expect(managementActions).not.toContain("console.");
    expect(managementActions).not.toMatch(/redirect\([^\n]*inviteToken/);
  });

  it("keeps management action identity server-owned and only forwards existing authority inputs", () => {
    expect(managementActions).toContain('"use server"');
    expect(managementActions).toContain("createPrivatePaperLeagueInviteAction(formData)");
    expect(managementActions).toContain("revokePrivatePaperLeagueInviteAction(formData)");
    expect(managementActions).toContain("setPrivatePaperLeagueMemberRoleAction(formData)");
    expect(managementActions).not.toContain('formData.get("userId")');
    expect(managementActions).not.toContain('formData.get("actorUserId")');
    expect(managementActions).not.toContain('formData.get("accountId")');
    expect(managementActions).not.toContain('formData.get("inviteTokenHash")');
  });

  it("does not expose member identifiers as participant labels and gives role controls only to owners", () => {
    expect(managementForms).toContain("Deltagare");
    expect(managementForms).toContain("Participant");
    expect(managementForms).toContain("member.userId");
    expect(managementForms).not.toContain("member.email");
    expect(managementPage).toContain('canEditRoles={workspace.role === "owner"}');
  });

  it("links management only from an owner/admin private workspace and never from public navigation", () => {
    expect(workspacePage).toContain('workspace.role === "owner" || workspace.role === "admin"');
    expect(workspacePage).toContain('href={`/paper-trading/private-leagues/${encodeURIComponent(workspace.competition.id)}/manage`}');
    expect(workspacePage).toContain("Hantera liga");
    expect(workspacePage).toContain("Manage league");
  });
});
