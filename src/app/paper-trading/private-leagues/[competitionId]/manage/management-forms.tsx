"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type {
  PrivatePaperLeagueInviteMetadataV3,
  PrivatePaperLeagueMemberV3,
} from "@/lib/paper-trading/private-league-read-repository-v3";
import {
  createPrivateLeagueManagementInviteAction,
  INITIAL_CREATE_PRIVATE_LEAGUE_MANAGEMENT_INVITE_STATE,
  INITIAL_REVOKE_PRIVATE_LEAGUE_MANAGEMENT_INVITE_STATE,
  INITIAL_SET_PRIVATE_LEAGUE_MANAGEMENT_MEMBER_ROLE_STATE,
  revokePrivateLeagueManagementInviteAction,
  setPrivateLeagueManagementMemberRoleAction,
} from "./actions";

type Props = {
  competitionId: string;
  invites: PrivatePaperLeagueInviteMetadataV3[];
  members: PrivatePaperLeagueMemberV3[];
  canEditRoles: boolean;
  sv: boolean;
};

function dateLabel(value: string, sv: boolean): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return sv ? "Okänd tid" : "Unknown time";
  return new Intl.DateTimeFormat(sv ? "sv-SE" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function roleLabel(role: PrivatePaperLeagueMemberV3["role"], sv: boolean): string {
  if (role === "owner") return sv ? "Ägare" : "Owner";
  if (role === "admin") return "Admin";
  return sv ? "Medlem" : "Member";
}

export function PrivateLeagueManagementForms({ competitionId, invites, members, canEditRoles, sv }: Props) {
  const [createState, createAction, createPending] = useActionState(
    createPrivateLeagueManagementInviteAction,
    INITIAL_CREATE_PRIVATE_LEAGUE_MANAGEMENT_INVITE_STATE,
  );
  const [revokeState, revokeAction, revokePending] = useActionState(
    revokePrivateLeagueManagementInviteAction,
    INITIAL_REVOKE_PRIVATE_LEAGUE_MANAGEMENT_INVITE_STATE,
  );
  const [roleState, roleAction, rolePending] = useActionState(
    setPrivateLeagueManagementMemberRoleAction,
    INITIAL_SET_PRIVATE_LEAGUE_MANAGEMENT_MEMBER_ROLE_STATE,
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-[#07111f]/70 p-5">
        <h2 className="serif text-xl font-semibold text-[#f4efe5]">{sv ? "Skapa ny inbjudan" : "Create new invite"}</h2>
        <p className="mt-2 text-xs leading-5 text-[#8391a4]">
          {sv
            ? "Ange en ISO-8601-tid med tidszon, till exempel 2026-09-20T18:00:00+02:00. Den hemliga token som skapas kan inte hämtas igen senare."
            : "Enter an ISO-8601 time with timezone, for example 2026-09-20T18:00:00+02:00. The secret token that is created cannot be retrieved later."}
        </p>
        <form action={createAction} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <input type="hidden" name="competitionId" value={competitionId} />
          <label className="text-xs text-[#9aa7b8]">
            {sv ? "Går ut" : "Expires at"}
            <input
              name="expiresAt"
              required
              placeholder="2026-09-20T18:00:00+02:00"
              className="mt-1 h-10 w-full rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white"
            />
          </label>
          <Button type="submit" disabled={createPending}>{createPending ? (sv ? "Skapar…" : "Creating…") : (sv ? "Skapa inbjudan" : "Create invite")}</Button>
        </form>

        {createState.status === "created" ? (
          <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-950/20 p-4">
            <p className="font-semibold text-amber-100">{sv ? "Kopiera den hemliga token nu" : "Copy the secret token now"}</p>
            <p className="mt-2 break-all font-mono text-sm text-amber-100">{createState.inviteToken}</p>
            <p className="mt-2 text-xs leading-5 text-amber-100/80">
              {sv ? "Token visas bara i detta svar och sparas inte i klartext av StockBox." : "The token is shown only in this response and is not stored in plaintext by StockBox."}
            </p>
          </div>
        ) : createState.status === "invalid" ? (
          <p className="mt-3 text-sm text-amber-200">{sv ? "Inbjudningstiden är ogiltig." : "The invite expiry is invalid."}</p>
        ) : createState.status === "error" ? (
          <p className="mt-3 text-sm text-amber-200">{sv ? "Inbjudan kunde inte skapas." : "The invite could not be created."}</p>
        ) : null}
      </div>

      <div className="rounded-xl border border-white/10 bg-[#07111f]/70 p-5">
        <h2 className="serif text-xl font-semibold text-[#f4efe5]">{sv ? "Inbjudningar" : "Invites"}</h2>
        {invites.length ? (
          <div className="mt-4 divide-y divide-white/10">
            {invites.map((invite, index) => {
              const revoked = invite.revokedAt !== null;
              const expired = Date.parse(invite.expiresAt) <= Date.now();
              return (
                <div key={invite.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#f4efe5]">{sv ? "Inbjudan" : "Invite"} {index + 1}</p>
                    <p className="mt-1 text-xs text-[#8391a4]">{sv ? "Skapad" : "Created"}: {dateLabel(invite.createdAt, sv)}</p>
                    <p className="mt-1 text-xs text-[#8391a4]">{sv ? "Går ut" : "Expires"}: {dateLabel(invite.expiresAt, sv)}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#b99b5f]">
                      {revoked ? (sv ? "Återkallad" : "Revoked") : expired ? (sv ? "Utgången" : "Expired") : (sv ? "Aktiv" : "Active")}
                    </p>
                  </div>
                  {!revoked && !expired ? (
                    <form action={revokeAction}>
                      <input type="hidden" name="competitionId" value={competitionId} />
                      <input type="hidden" name="inviteId" value={invite.id} />
                      <Button type="submit" variant="secondary" disabled={revokePending}>
                        {sv ? "Återkalla" : "Revoke"}
                      </Button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : <p className="mt-4 text-sm text-[#8391a4]">{sv ? "Inga verifierade inbjudningar att visa." : "No verified invites to show."}</p>}
        {revokeState.status === "error" || revokeState.status === "invalid" ? (
          <p className="mt-3 text-sm text-amber-200">{sv ? "Inbjudan kunde inte återkallas." : "The invite could not be revoked."}</p>
        ) : revokeState.status === "revoked" ? (
          <p className="mt-3 text-sm text-[#e1cb95]">{sv ? "Inbjudan återkallades." : "Invite revoked."}</p>
        ) : null}
      </div>

      <div className="rounded-xl border border-white/10 bg-[#07111f]/70 p-5">
        <h2 className="serif text-xl font-semibold text-[#f4efe5]">{sv ? "Medlemmar" : "Members"}</h2>
        <p className="mt-2 text-xs leading-5 text-[#8391a4]">
          {canEditRoles
            ? (sv ? "Som ägare kan du göra befintliga deltagare till admin eller medlem. Ägarskapet kan inte flyttas här." : "As owner, you can make existing participants admin or member. Ownership cannot be transferred here.")
            : (sv ? "Som admin kan du se verifierade medlemmar men bara ägaren kan ändra roller." : "As admin, you can view verified members, but only the owner can change roles.")}
        </p>
        <div className="mt-4 divide-y divide-white/10">
          {members.map((member, index) => (
            <div key={member.userId} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#f4efe5]">{sv ? "Deltagare" : "Participant"} {index + 1}</p>
                <p className="mt-1 text-xs uppercase tracking-wide text-[#b99b5f]">{roleLabel(member.role, sv)}</p>
              </div>
              {canEditRoles && member.role !== "owner" ? (
                <form action={roleAction} className="flex items-end gap-2">
                  <input type="hidden" name="competitionId" value={competitionId} />
                  <input type="hidden" name="memberUserId" value={member.userId} />
                  <label className="text-xs text-[#9aa7b8]">
                    {sv ? "Roll" : "Role"}
                    <select name="role" defaultValue={member.role === "admin" ? "admin" : "member"} className="mt-1 h-10 rounded-md border border-white/12 bg-[#07111f] px-3 text-sm text-white">
                      <option value="member">{sv ? "Medlem" : "Member"}</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                  <Button type="submit" variant="secondary" disabled={rolePending}>{sv ? "Spara" : "Save"}</Button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
        {roleState.status === "error" || roleState.status === "invalid" ? (
          <p className="mt-3 text-sm text-amber-200">{sv ? "Rollen kunde inte uppdateras." : "The role could not be updated."}</p>
        ) : roleState.status === "updated" ? (
          <p className="mt-3 text-sm text-[#e1cb95]">{sv ? "Rollen uppdaterades." : "Role updated."}</p>
        ) : null}
      </div>
    </div>
  );
}
