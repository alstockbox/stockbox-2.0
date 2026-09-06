"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { isFeatureEnabled, isKilled } from "@/lib/feature-flags";
import { PAPER_TRADING_V3_STARTING_CASH } from "@/lib/paper-trading/accounts-v3";
import {
  joinPaperCompetitionV3,
  loadPaperChallengeTradingContextV3,
} from "@/lib/paper-trading/competition-repository-v3";
import { executePaperOrderServiceV3 } from "@/lib/paper-trading/order-service-v3";
import {
  generatePrivateLeagueInviteTokenV3,
  hashPrivateLeagueInviteTokenV3,
} from "@/lib/paper-trading/private-league-invite-v3";
import {
  createPrivatePaperLeagueInviteV3,
  createPrivatePaperLeagueV3,
  joinPrivatePaperLeagueV3,
  revokePrivatePaperLeagueInviteV3,
  setPrivatePaperLeagueMemberRoleV3,
} from "@/lib/paper-trading/private-league-repository-v3";
import { createPaperAccountV3, loadPaperAccountBoundaryV3 } from "@/lib/paper-trading/repository-v3";

const accountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  baseCurrency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
});

const challengeJoinSchema = z.object({
  competitionId: z.string().uuid(),
});

const orderSchema = z.object({
  accountId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(1).max(128),
  ticker: z.string().trim().min(1).max(32).transform((value) => value.toUpperCase()),
  side: z.enum(["buy", "sell"]),
  quantity: z.coerce.number().finite().positive().max(1_000_000_000),
});

const challengeOrderSchema = z.object({
  competitionId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(1).max(128),
  ticker: z.string().trim().min(1).max(32).transform((value) => value.toUpperCase()),
  side: z.enum(["buy", "sell"]),
  quantity: z.coerce.number().finite().positive().max(1_000_000_000),
});

const privateLeagueTimestampSchema = z.string().trim().refine(
  (value) => /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)),
).transform((value) => new Date(value).toISOString());

const privateLeagueJoinSchema = z.object({
  inviteToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

const privateLeagueCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  baseCurrency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
  startsAt: privateLeagueTimestampSchema,
  joinDeadline: privateLeagueTimestampSchema,
  endsAt: privateLeagueTimestampSchema,
  maxParticipants: z.coerce.number().int().min(2).max(10_000),
});

const privateLeagueInviteCreateSchema = z.object({
  competitionId: z.string().uuid(),
  expiresAt: privateLeagueTimestampSchema,
});

const privateLeagueInviteRevokeSchema = z.object({
  inviteId: z.string().uuid(),
});

const privateLeagueRoleSchema = z.object({
  competitionId: z.string().uuid(),
  memberUserId: z.string().uuid(),
  role: z.enum(["admin", "member"]),
});

function featureAvailable(): boolean {
  return isFeatureEnabled("paperTrading") && !isKilled("paperTrading");
}

function challengeAvailable(): boolean {
  return isFeatureEnabled("paperTrading")
    && isFeatureEnabled("challenges")
    && !isKilled("paperTrading");
}

function privateLeagueAvailable(): boolean {
  return isFeatureEnabled("paperTrading")
    && isFeatureEnabled("privateLeagues")
    && !isKilled("paperTrading");
}

export async function createPaperAccountAction(formData: FormData) {
  const user = await requireUser();
  if (!featureAvailable()) redirect("/dashboard");

  const parsed = accountSchema.safeParse({
    name: formData.get("name"),
    baseCurrency: formData.get("baseCurrency"),
  });
  if (!parsed.success) redirect("/paper-trading?accountStatus=invalid");

  const result = await createPaperAccountV3({
    userId: user.id,
    name: parsed.data.name,
    baseCurrency: parsed.data.baseCurrency,
    startingCash: PAPER_TRADING_V3_STARTING_CASH,
  });
  if (!result.ok) redirect("/paper-trading?accountStatus=error");

  revalidatePath("/paper-trading");
  redirect(`/paper-trading?account=${encodeURIComponent(result.data.id)}&accountStatus=created`);
}

export async function joinPaperChallengeAction(formData: FormData) {
  const user = await requireUser();
  if (!challengeAvailable()) redirect("/dashboard");

  const parsed = challengeJoinSchema.safeParse({
    competitionId: formData.get("competitionId"),
  });
  if (!parsed.success) redirect("/paper-trading?challengeStatus=invalid");

  const result = await joinPaperCompetitionV3(user.id, parsed.data.competitionId);
  revalidatePath("/paper-trading");
  if (!result.ok) redirect("/paper-trading?challengeStatus=error");
  redirect(`/paper-trading?challengeStatus=joined&competition=${encodeURIComponent(parsed.data.competitionId)}`);
}

export async function executePaperOrderAction(formData: FormData) {
  const user = await requireUser();
  if (!featureAvailable()) redirect("/dashboard");

  const parsed = orderSchema.safeParse({
    accountId: formData.get("accountId"),
    idempotencyKey: formData.get("idempotencyKey"),
    ticker: formData.get("ticker"),
    side: formData.get("side"),
    quantity: formData.get("quantity"),
  });
  if (!parsed.success) redirect("/paper-trading?tradeStatus=invalid");

  const boundary = await loadPaperAccountBoundaryV3(user.id, parsed.data.accountId);
  if (!boundary.ok) {
    redirect(`/paper-trading?account=${encodeURIComponent(parsed.data.accountId)}&tradeStatus=error`);
  }
  if (boundary.account.status !== "active" || boundary.account.accountType !== "personal") {
    redirect(`/paper-trading?account=${encodeURIComponent(parsed.data.accountId)}&tradeStatus=invalid`);
  }

  const result = await executePaperOrderServiceV3({
    userId: user.id,
    accountId: parsed.data.accountId,
    intent: {
      idempotencyKey: parsed.data.idempotencyKey,
      ticker: parsed.data.ticker,
      side: parsed.data.side,
      quantity: parsed.data.quantity,
    },
  });

  revalidatePath("/paper-trading");
  if (result.status === "FILLED") redirect(`/paper-trading?account=${encodeURIComponent(parsed.data.accountId)}&tradeStatus=filled`);
  if (result.status === "ALREADY_RECORDED") redirect(`/paper-trading?account=${encodeURIComponent(parsed.data.accountId)}&tradeStatus=existing`);
  if (result.status === "REJECTED") redirect(`/paper-trading?account=${encodeURIComponent(parsed.data.accountId)}&tradeStatus=rejected&reason=${encodeURIComponent(result.reason)}`);
  if (result.status === "KILLED") redirect(`/paper-trading?account=${encodeURIComponent(parsed.data.accountId)}&tradeStatus=paused`);
  if (result.status === "DISABLED") redirect("/dashboard");
  redirect(`/paper-trading?account=${encodeURIComponent(parsed.data.accountId)}&tradeStatus=error`);
}

export async function executePaperChallengeOrderAction(formData: FormData) {
  const user = await requireUser();
  if (!challengeAvailable()) redirect("/dashboard");

  const parsed = challengeOrderSchema.safeParse({
    competitionId: formData.get("competitionId"),
    idempotencyKey: formData.get("idempotencyKey"),
    ticker: formData.get("ticker"),
    side: formData.get("side"),
    quantity: formData.get("quantity"),
  });
  if (!parsed.success) redirect("/paper-trading/challenges?tradeStatus=invalid");

  const contextResult = await loadPaperChallengeTradingContextV3(user.id, parsed.data.competitionId);
  if (!contextResult.ok) {
    redirect(`/paper-trading/challenges?competition=${encodeURIComponent(parsed.data.competitionId)}&tradeStatus=unavailable`);
  }
  const context = contextResult.context;

  const result = await executePaperOrderServiceV3({
    userId: user.id,
    accountId: context.accountId,
    intent: {
      idempotencyKey: parsed.data.idempotencyKey,
      ticker: parsed.data.ticker,
      side: parsed.data.side,
      quantity: parsed.data.quantity,
    },
  });

  revalidatePath("/paper-trading/challenges");
  if (result.status === "FILLED") redirect(`/paper-trading/challenges?competition=${encodeURIComponent(parsed.data.competitionId)}&tradeStatus=filled`);
  if (result.status === "ALREADY_RECORDED") redirect(`/paper-trading/challenges?competition=${encodeURIComponent(parsed.data.competitionId)}&tradeStatus=existing`);
  if (result.status === "REJECTED") redirect(`/paper-trading/challenges?competition=${encodeURIComponent(parsed.data.competitionId)}&tradeStatus=rejected&reason=${encodeURIComponent(result.reason)}`);
  if (result.status === "KILLED") redirect(`/paper-trading/challenges?competition=${encodeURIComponent(parsed.data.competitionId)}&tradeStatus=paused`);
  if (result.status === "DISABLED") redirect("/dashboard");
  redirect(`/paper-trading/challenges?competition=${encodeURIComponent(parsed.data.competitionId)}&tradeStatus=error`);
}

export async function joinPrivatePaperLeagueAction(formData: FormData) {
  const user = await requireUser();
  if (!privateLeagueAvailable()) redirect("/dashboard");

  const parsed = privateLeagueJoinSchema.safeParse({
    inviteToken: formData.get("inviteToken"),
  });
  if (!parsed.success) return { status: "invalid" } as const;

  const inviteTokenHash = hashPrivateLeagueInviteTokenV3(parsed.data.inviteToken);
  if (!inviteTokenHash) return { status: "invalid" } as const;

  const result = await joinPrivatePaperLeagueV3(user.id, inviteTokenHash);
  if (!result.ok) return { status: "error" } as const;
  revalidatePath("/paper-trading");
  return { status: "joined" } as const;
}

export async function createPrivatePaperLeagueAction(formData: FormData) {
  const user = await requireUser();
  if (!privateLeagueAvailable()) redirect("/dashboard");

  const parsed = privateLeagueCreateSchema.safeParse({
    name: formData.get("name"),
    baseCurrency: formData.get("baseCurrency"),
    startsAt: formData.get("startsAt"),
    joinDeadline: formData.get("joinDeadline"),
    endsAt: formData.get("endsAt"),
    maxParticipants: formData.get("maxParticipants"),
  });
  if (!parsed.success) return { status: "invalid" } as const;

  let inviteToken: string;
  try {
    inviteToken = generatePrivateLeagueInviteTokenV3();
  } catch {
    return { status: "error" } as const;
  }
  const inviteTokenHash = hashPrivateLeagueInviteTokenV3(inviteToken);
  if (!inviteTokenHash) return { status: "error" } as const;

  const result = await createPrivatePaperLeagueV3({
    ownerUserId: user.id,
    name: parsed.data.name,
    baseCurrency: parsed.data.baseCurrency,
    startsAt: parsed.data.startsAt,
    joinDeadline: parsed.data.joinDeadline,
    endsAt: parsed.data.endsAt,
    maxParticipants: parsed.data.maxParticipants,
    inviteTokenHash,
    inviteExpiresAt: parsed.data.joinDeadline,
  });
  if (!result.ok) return { status: "error" } as const;

  revalidatePath("/paper-trading");
  return { status: "created", competitionId: result.competitionId, inviteToken } as const;
}

export async function createPrivatePaperLeagueInviteAction(formData: FormData) {
  const user = await requireUser();
  if (!privateLeagueAvailable()) redirect("/dashboard");

  const parsed = privateLeagueInviteCreateSchema.safeParse({
    competitionId: formData.get("competitionId"),
    expiresAt: formData.get("expiresAt"),
  });
  if (!parsed.success) return { status: "invalid" } as const;

  let inviteToken: string;
  try {
    inviteToken = generatePrivateLeagueInviteTokenV3();
  } catch {
    return { status: "error" } as const;
  }
  const inviteTokenHash = hashPrivateLeagueInviteTokenV3(inviteToken);
  if (!inviteTokenHash) return { status: "error" } as const;

  const result = await createPrivatePaperLeagueInviteV3({
    actorUserId: user.id,
    competitionId: parsed.data.competitionId,
    inviteTokenHash,
    expiresAt: parsed.data.expiresAt,
  });
  if (!result.ok) return { status: "error" } as const;

  revalidatePath("/paper-trading");
  return {
    status: "created",
    competitionId: result.competitionId,
    inviteId: result.inviteId,
    expiresAt: result.expiresAt,
    inviteToken,
  } as const;
}

export async function revokePrivatePaperLeagueInviteAction(formData: FormData) {
  const user = await requireUser();
  if (!privateLeagueAvailable()) redirect("/dashboard");

  const parsed = privateLeagueInviteRevokeSchema.safeParse({
    inviteId: formData.get("inviteId"),
  });
  if (!parsed.success) return { status: "invalid" } as const;

  const result = await revokePrivatePaperLeagueInviteV3({
    actorUserId: user.id,
    inviteId: parsed.data.inviteId,
  });
  if (!result.ok) return { status: "error" } as const;
  revalidatePath("/paper-trading");
  return { status: "revoked" } as const;
}

export async function setPrivatePaperLeagueMemberRoleAction(formData: FormData) {
  const user = await requireUser();
  if (!privateLeagueAvailable()) redirect("/dashboard");

  const parsed = privateLeagueRoleSchema.safeParse({
    competitionId: formData.get("competitionId"),
    memberUserId: formData.get("memberUserId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { status: "invalid" } as const;

  const result = await setPrivatePaperLeagueMemberRoleV3({
    actorUserId: user.id,
    competitionId: parsed.data.competitionId,
    memberUserId: parsed.data.memberUserId,
    role: parsed.data.role,
  });
  if (!result.ok) return { status: "error" } as const;
  revalidatePath("/paper-trading");
  return { status: "updated", role: result.role } as const;
}
