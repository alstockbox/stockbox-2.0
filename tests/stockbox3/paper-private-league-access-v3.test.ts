import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  const fullPath = path.join(process.cwd(), relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : "";
}

const createPage = source("src/app/paper-trading/private-leagues/new/page.tsx");
const joinPage = source("src/app/paper-trading/private-leagues/join/page.tsx");
const forms = source("src/app/paper-trading/private-leagues/access-forms.tsx");
const accessActions = source("src/app/paper-trading/private-leagues/access-actions.ts");
const memberList = source("src/app/paper-trading/private-leagues/page.tsx");

describe("Paper Trading V3 private league create/join access", () => {
  it("dark-gates both access routes and blocks mutations while paper trading is killed", () => {
    for (const page of [createPage, joinPage]) {
      expect(page).toContain('isFeatureEnabled("paperTrading")');
      expect(page).toContain('isFeatureEnabled("privateLeagues")');
      expect(page).toContain("notFound()");
      expect(page).toContain("await requireUser()");
      expect(page).toContain('const killed = isKilled("paperTrading")');
    }
    expect(createPage).toContain("!killed ? <PrivateLeagueCreateForm />");
    expect(joinPage).toContain("!killed ? <PrivateLeagueJoinForm />");
  });

  it("uses client action-state forms backed only by thin server adapters", () => {
    expect(forms).toContain('"use client"');
    expect(forms).toContain("useActionState");
    expect(forms).toContain("createPrivateLeagueAccessAction");
    expect(forms).toContain("joinPrivateLeagueAccessAction");
    expect(accessActions).toContain('"use server"');
    expect(accessActions).toContain("createPrivatePaperLeagueAction(formData)");
    expect(accessActions).toContain("joinPrivatePaperLeagueAction(formData)");
    expect(accessActions).not.toContain("createAdminClient");
    expect(accessActions).not.toContain("inviteTokenHash");
    expect(accessActions).not.toContain("paper_private_league");
  });

  it("keeps create authority limited to league terms and never accepts identity, account or invite hash fields", () => {
    expect(forms).toContain('name="name"');
    expect(forms).toContain('name="baseCurrency"');
    expect(forms).toContain('name="startsAt"');
    expect(forms).toContain('name="joinDeadline"');
    expect(forms).toContain('name="endsAt"');
    expect(forms).toContain('name="maxParticipants"');
    expect(forms).not.toContain('name="userId"');
    expect(forms).not.toContain('name="ownerUserId"');
    expect(forms).not.toContain('name="accountId"');
    expect(forms).not.toContain('name="inviteTokenHash"');
    expect(forms).toContain("ISO 8601");
  });

  it("shows the raw create invite token only as one-time successful action state, never in a URL or persistent browser storage", () => {
    expect(forms).toContain('createState.status === "created"');
    expect(forms).toContain("createState.inviteToken");
    expect(forms).toContain("visas bara i detta svar");
    expect(forms).toContain("shown only in this response");
    expect(forms).not.toContain("URLSearchParams");
    expect(forms).not.toContain("localStorage");
    expect(forms).not.toContain("sessionStorage");
    expect(forms).not.toContain("console.log");
    expect(forms).not.toMatch(/href=\{?[^\n]*inviteToken/);
    expect(accessActions).not.toContain("redirect(`");
  });

  it("joins only from an opaque raw invite token and performs no private league discovery", () => {
    expect(forms).toContain('name="inviteToken"');
    expect(forms).not.toContain('name="competitionId"');
    expect(joinPage).not.toContain("searchParams");
    expect(joinPage).not.toContain("listOpenPrivate");
    expect(joinPage).not.toContain("paper_competitions_v3");
    expect(forms).toContain('joinState.status === "joined"');
    expect(forms).not.toContain("inviteTokenHash");
  });

  it("keeps action result states generic except for the one-time create token", () => {
    expect(accessActions).toContain('status: "idle"');
    expect(accessActions).toContain('status: "invalid"');
    expect(accessActions).toContain('status: "error"');
    expect(accessActions).toContain('status: "joined"');
    expect(accessActions).toContain('status: "created"');
    expect(accessActions).toContain("inviteToken: result.inviteToken");
    expect(accessActions).toContain("competitionId: result.competitionId");
    expect(accessActions).not.toContain("result.error");
    expect(accessActions).not.toContain("reason:");
  });

  it("adds create and join entry points only inside the authenticated private member area", () => {
    expect(memberList).toContain('href="/paper-trading/private-leagues/new"');
    expect(memberList).toContain('href="/paper-trading/private-leagues/join"');
    expect(memberList).toContain("Skapa privat liga");
    expect(memberList).toContain("Gå med via inbjudan");
    expect(memberList).toContain("Create private league");
    expect(memberList).toContain("Join with invite");
    expect(memberList).not.toContain('name="inviteToken"');
  });

  it("keeps all access copy explicit that leagues are private simulations and invite tokens are secrets", () => {
    expect(createPage.toLowerCase()).toContain("simulat");
    expect(joinPage.toLowerCase()).toContain("simulat");
    expect(createPage).toContain("inte publikt sökbar");
    expect(joinPage).toContain("inte publikt sökbar");
    expect(createPage).toContain("not publicly discoverable");
    expect(joinPage).toContain("not publicly discoverable");
    expect(forms).toContain("hemlighet");
    expect(forms).toContain("secret");
  });
});
