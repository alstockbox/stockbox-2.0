"use server";

import { revalidatePath } from "next/cache";
import {
  createPrivatePaperLeagueAction,
  joinPrivatePaperLeagueAction,
} from "../actions";

export type CreatePrivateLeagueAccessState =
  | { status: "idle" }
  | { status: "invalid" }
  | { status: "error" }
  | { status: "created"; competitionId: string; inviteToken: string };

export type JoinPrivateLeagueAccessState =
  | { status: "idle" }
  | { status: "invalid" }
  | { status: "error" }
  | { status: "joined" };

export const INITIAL_CREATE_PRIVATE_LEAGUE_ACCESS_STATE: CreatePrivateLeagueAccessState = { status: "idle" };
export const INITIAL_JOIN_PRIVATE_LEAGUE_ACCESS_STATE: JoinPrivateLeagueAccessState = { status: "idle" };

export async function createPrivateLeagueAccessAction(
  _previousState: CreatePrivateLeagueAccessState,
  formData: FormData,
): Promise<CreatePrivateLeagueAccessState> {
  const result = await createPrivatePaperLeagueAction(formData);
  if (result.status === "invalid") return { status: "invalid" };
  if (result.status !== "created") return { status: "error" };

  revalidatePath("/paper-trading/private-leagues");
  return {
    status: "created",
    competitionId: result.competitionId,
    inviteToken: result.inviteToken,
  };
}

export async function joinPrivateLeagueAccessAction(
  _previousState: JoinPrivateLeagueAccessState,
  formData: FormData,
): Promise<JoinPrivateLeagueAccessState> {
  const result = await joinPrivatePaperLeagueAction(formData);
  if (result.status === "invalid") return { status: "invalid" };
  if (result.status !== "joined") return { status: "error" };

  revalidatePath("/paper-trading/private-leagues");
  return { status: "joined" };
}
