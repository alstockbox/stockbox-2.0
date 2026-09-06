import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, LockKeyhole, PauseCircle, ShieldCheck } from "lucide-react";
import { Card, Container, Section } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { isFeatureEnabled, isKilled } from "@/lib/feature-flags";
import { getLocale } from "@/lib/i18n/server";
import {
  listPrivatePaperLeagueInvitesV3,
  listPrivatePaperLeagueMembersV3,
  loadPrivatePaperLeagueWorkspaceV3,
} from "@/lib/paper-trading/private-league-read-repository-v3";
import { paperTradingServerNowMsV3 } from "@/lib/paper-trading/server-clock-v3";
import { PrivateLeagueManagementForms } from "./management-forms";

export const metadata: Metadata = { title: "Manage Private Paper Trading League" };

type PageProps = {
  params: Promise<{ competitionId: string }>;
};

function dateLabel(value: string, sv: boolean): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return sv ? "Okänd tid" : "Unknown time";
  return new Intl.DateTimeFormat(sv ? "sv-SE" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function roleLabel(role: "owner" | "admin" | "member", sv: boolean): string {
  if (role === "owner") return sv ? "Ägare" : "Owner";
  if (role === "admin") return "Admin";
  return sv ? "Medlem" : "Member";
}

export default async function PrivatePaperLeagueManagementPage({ params }: PageProps) {
  if (!isFeatureEnabled("paperTrading") || !isFeatureEnabled("privateLeagues")) notFound();

  const user = await requireUser();
  const [{ competitionId: rawCompetitionId }, locale] = await Promise.all([params, getLocale()]);
  const competitionId = rawCompetitionId.trim();
  if (!competitionId) notFound();

  const workspaceResult = await loadPrivatePaperLeagueWorkspaceV3(user.id, competitionId);
  if (!workspaceResult.ok) notFound();
  const workspace = workspaceResult.workspace;
  if (workspace.role !== "owner" && workspace.role !== "admin") notFound();

  const [invitesResult, membersResult] = await Promise.all([
    listPrivatePaperLeagueInvitesV3(user.id, workspace.competition.id),
    listPrivatePaperLeagueMembersV3(user.id, workspace.competition.id),
  ]);

  const sv = locale === "sv";
  const killed = isKilled("paperTrading");
  const evidenceVerified = invitesResult.ok && membersResult.ok;
  const mutationsEnabled = !killed && evidenceVerified;
  const nowMs = paperTradingServerNowMsV3();

  return (
    <Section>
      <Container>
        <Link
          href={`/paper-trading/private-leagues/${encodeURIComponent(workspace.competition.id)}`}
          className="inline-flex items-center gap-2 text-sm text-[#9aa7b8] transition hover:text-[#f4efe5]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {sv ? "Tillbaka till ligan" : "Back to league"}
        </Link>

        <div className="mt-6 max-w-3xl">
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-5 w-5 text-[#e1cb95]" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b99b5f]">Private League Management</p>
          </div>
          <h1 className="serif mt-3 text-3xl font-semibold text-[#f4efe5] sm:text-4xl">
            {sv ? "Hantera privat liga" : "Manage private league"}
          </h1>
          <p className="mt-3 text-lg font-semibold text-[#f4efe5]">{workspace.competition.name}</p>
          <p className="mt-3 text-sm leading-6 text-[#9aa7b8]">
            {sv
              ? "Den här sidan är endast tillgänglig för verifierad ägare eller admin. Inbjudningar lagras bara som hash, privata ligor är inte publikt sökbara och all handel är simulerad."
              : "This page is available only to a verified owner or admin. Invites are stored only as hashes, private leagues are not publicly discoverable, and all trading is simulated."}
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <p className="text-xs uppercase tracking-wide text-[#8391a4]">{sv ? "Din roll" : "Your role"}</p>
            <p className="mt-2 font-semibold text-[#f4efe5]">{roleLabel(workspace.role, sv)}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-[#8391a4]">{sv ? "Start" : "Starts"}</p>
            <p className="mt-2 text-sm font-semibold text-[#f4efe5]">{dateLabel(workspace.competition.startsAt, sv)}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-[#8391a4]">{sv ? "Sista anslutning" : "Join deadline"}</p>
            <p className="mt-2 text-sm font-semibold text-[#f4efe5]">{dateLabel(workspace.competition.joinDeadline, sv)}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-[#8391a4]">Status</p>
            <p className="mt-2 text-sm font-semibold uppercase text-[#e1cb95]">{workspace.competition.status}</p>
          </Card>
        </div>

        {killed ? (
          <Card className="mt-6 border-amber-300/20 bg-amber-950/20">
            <div className="flex gap-3">
              <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" aria-hidden="true" />
              <div>
                <p className="font-semibold text-amber-100">{sv ? "Management är read-only" : "Management is read-only"}</p>
                <p className="mt-1 text-sm text-amber-100/80">
                  {sv ? "Verifierad invite- och medlemsmetadata kan visas, men inga ändringar görs medan Paper Trading är pausat." : "Verified invite and membership metadata remains visible, but no changes can be made while Paper Trading is paused."}
                </p>
              </div>
            </div>
          </Card>
        ) : null}

        {!evidenceVerified ? (
          <Card className="mt-6 border-amber-300/20 bg-amber-950/20">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" aria-hidden="true" />
              <div>
                <p className="font-semibold text-amber-100">{sv ? "Managementdata kunde inte verifieras" : "Management data could not be verified"}</p>
                <p className="mt-1 text-sm text-amber-100/80">
                  {sv ? "StockBox visar inga delvisa medlems- eller inbjudningslistor och tillåter inga ändringar förrän hela underlaget kan verifieras." : "StockBox shows no partial membership or invite lists and permits no changes until the complete evidence can be verified."}
                </p>
              </div>
            </div>
          </Card>
        ) : mutationsEnabled ? (
          <div className="mt-6">
            <PrivateLeagueManagementForms
              competitionId={workspace.competition.id}
              invites={invitesResult.invites}
              members={membersResult.members}
              canEditRoles={workspace.role === "owner"}
              nowMs={nowMs}
              sv={sv}
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="serif text-xl font-semibold text-[#f4efe5]">{sv ? "Inbjudningar" : "Invites"}</h2>
              {invitesResult.ok && invitesResult.invites.length ? (
                <div className="mt-4 divide-y divide-white/10">
                  {invitesResult.invites.map((invite, index) => (
                    <div key={invite.id} className="py-3 first:pt-0 last:pb-0">
                      <p className="text-sm font-semibold text-[#f4efe5]">{sv ? "Inbjudan" : "Invite"} {index + 1}</p>
                      <p className="mt-1 text-xs text-[#8391a4]">{sv ? "Går ut" : "Expires"}: {dateLabel(invite.expiresAt, sv)}</p>
                      <p className="mt-1 text-xs text-[#8391a4]">{invite.revokedAt ? (sv ? "Återkallad" : "Revoked") : (sv ? "Inte återkallad" : "Not revoked")}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="mt-4 text-sm text-[#8391a4]">{sv ? "Inga verifierade inbjudningar." : "No verified invites."}</p>}
            </Card>

            <Card>
              <h2 className="serif text-xl font-semibold text-[#f4efe5]">{sv ? "Medlemmar" : "Members"}</h2>
              {membersResult.ok ? (
                <div className="mt-4 divide-y divide-white/10">
                  {membersResult.members.map((member, index) => (
                    <div key={member.userId} className="py-3 first:pt-0 last:pb-0">
                      <p className="text-sm font-semibold text-[#f4efe5]">{sv ? "Deltagare" : "Participant"} {index + 1}</p>
                      <p className="mt-1 text-xs uppercase tracking-wide text-[#b99b5f]">{roleLabel(member.role, sv)}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>
          </div>
        )}

        <Card className="mt-6 border-white/10 bg-[#07111f]/60">
          <p className="text-xs leading-5 text-[#8391a4]">
            {sv
              ? "StockBox exponerar inte råa invite-token eller invite-hashar i managementvyn. Medlemmar visas som anonyma deltagare och bara ligans ägare kan ändra admin-/medlemsroller."
              : "StockBox does not expose raw invite tokens or invite hashes in the management view. Members are shown as anonymous participants, and only the league owner can change admin/member roles."}
          </p>
        </Card>
      </Container>
    </Section>
  );
}
