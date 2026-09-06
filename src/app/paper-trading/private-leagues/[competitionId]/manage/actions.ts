"use server";

import { revalidatePath } from "next/cache";
import {
  createPrivatePaperLeagueInviteAction,
  revokePrivatePaperLeagueInviteAction,
  setPrivatePaperLeagueMemberRoleAction,
} from "../../../actions";

export type CreatePrivateLeagueManagementInviteState =
  | { status: "idle" }
  | { status: "invalid" }
  | { status: "error" }
  | { status: "created"; competitionId: string; inviteId: string; expiresAt: string; inviteToken: string };

export type RevokePrivateLeagueManagementInviteState =
  | { status: "idle" }
  | { status: "invalid" }
  | { status: "error" }
  | { status: "revoked" };

export type SetPrivateLeagueManagementMemberRoleState =
  | { status: "idle" }
  | { status: "invalid" }
  | { status: "error" }
  | { status: "updated"; role: "admin" | "member" };

export const INITIAL_CREATE_PRIVATE_LEAGUE_MANAGEMENT_INVITE_STATE: CreatePrivateLeagueManagementInviteState = { status: "idle" };
export const INITIAL_REVOKE_PRIVATE_LEAGUE_MANAGEMENT_INVITE_STATE: RevokePrivateLeagueManagementInviteState = { status: "idle" };
export const INITIAL_SET_PRIVATE_LEAGUE_MANAGEMENT_MEMBER_ROLE_STATE: SetPrivateLeagueManagementMemberRoleState = { status: "idle" };

function revalidatePrivateLeagueManagement(competitionId: string): void {
  revalidatePath("/paper-trading/private-leagues");
  revalidatePath(`/paper-trading/private-leagues/${competitionId}`);
  revalidatePath(`/paper-trading/private-leagues/${competitionId}/manage`);
}

export async function createPrivateLeagueManagementInviteAction(
  _previousState: CreatePrivateLeagueManagementInviteState,
  formData: FormData,
): Promise<CreatePrivateLeagueManagementInviteState> {
  const result = await createPrivatePaperLeagueInviteAction(formData);
  if (result.status === "invalid") return { status: "invalid" };
  if (result.status !== "created") return { status: "error" };

  revalidatePrivateLeagueManagement(result.competitionId);
  return {
    status: "created",
    competitionId: result.competitionId,
    inviteId: result.inviteId,
    expiresAt: result.expiresAt,
    inviteToken: result.inviteToken,
  };
}

export async function revokePrivateLeagueManagementInviteAction(
  _previousState: RevokePrivateLeagueManagementInviteState,
  formData: FormData,
): Promise<RevokePrivateLeagueManagementInviteState> {
  const competitionId = String(formData.get("competitionId") ?? "").trim();
  const result = await revokePrivatePaperLeagueInviteAction(formData);
  if (result.status === "invalid") return { status: "invalid" };
  if (result.status !== "revoked") return { status: "error" };

  if (competitionId) revalidatePrivateLeagueManagement(competitionId);
  return { status: "revoked" };
}

export async function setPrivateLeagueManagementMemberRoleAction(
  _previousState: SetPrivateLeagueManagementMemberRoleState,
  formData: FormData,
): Promise<SetPrivateLeagueManagementMemberRoleState> {
  const competitionId = String(formData.get("competitionId") ?? "").trim();
  const result = await setPrivatePaperLeagueMemberRoleAction(formData);
  if (result.status === "invalid") return { status: "invalid" };
  if (result.status !== "updated") return { status: "error" };

  if (competitionId) revalidatePrivateLeagueManagement(competitionId);
  return { status: "updated", role: result.role };
}
