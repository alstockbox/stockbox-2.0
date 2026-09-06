import { createAdminClient } from "@/lib/supabase/admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PaperCompetitionValuationClaimV3 =
  | {
      claimed: false;
      leaseToken: null;
      claimedAt: string;
      leaseExpiresAt: null;
    }
  | {
      claimed: true;
      leaseToken: string;
      claimedAt: string;
      leaseExpiresAt: string;
    };

export type PaperCompetitionValuationClaimResultV3 =
  | { ok: true; claim: PaperCompetitionValuationClaimV3 }
  | {
      ok: false;
      error:
        | "PAPER_COMPETITION_VALUATION_CLAIM_INVALID_INPUT"
        | "PAPER_COMPETITION_VALUATION_CLAIM_INVALID_RESULT"
        | "PAPER_COMPETITION_VALUATION_CLAIM_FAILED"
        | "SUPABASE_ADMIN_NOT_CONFIGURED";
    };

export type PaperCompetitionFinalValuationClaimResultV3 =
  | { ok: true; claim: PaperCompetitionValuationClaimV3 }
  | {
      ok: false;
      error:
        | "PAPER_COMPETITION_FINAL_VALUATION_CLAIM_INVALID_INPUT"
        | "PAPER_COMPETITION_FINAL_VALUATION_CLAIM_INVALID_RESULT"
        | "PAPER_COMPETITION_FINAL_VALUATION_CLAIM_FAILED"
        | "SUPABASE_ADMIN_NOT_CONFIGURED";
    };

export type PaperCompetitionValuationCompletionOutcomeV3 = "verified" | "unavailable" | "error";

export type PaperCompetitionValuationCompleteResultV3 =
  | { ok: true; completed: true }
  | {
      ok: false;
      error:
        | "PAPER_COMPETITION_VALUATION_COMPLETE_INVALID_INPUT"
        | "PAPER_COMPETITION_VALUATION_COMPLETE_INVALID_RESULT"
        | "PAPER_COMPETITION_VALUATION_COMPLETE_REJECTED"
        | "PAPER_COMPETITION_VALUATION_COMPLETE_FAILED"
        | "SUPABASE_ADMIN_NOT_CONFIGURED";
    };

type JsonRow = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function timestamp(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  const ms = Date.parse(candidate);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Claims one DB-owned challenge valuation window. No caller-controlled clock,
 * cooldown or lease duration is accepted here; those invariants live in the
 * service-role-only database RPC.
 */
export async function claimPaperCompetitionValuationV3(
  competitionIdInput: string,
): Promise<PaperCompetitionValuationClaimResultV3> {
  const competitionId = competitionIdInput.trim();
  if (!UUID_PATTERN.test(competitionId)) {
    return { ok: false, error: "PAPER_COMPETITION_VALUATION_CLAIM_INVALID_INPUT" };
  }

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const { data, error } = await supabase.rpc("claim_paper_competition_valuation_v3", {
      p_competition_id: competitionId,
    });
    if (error) return { ok: false, error: "PAPER_COMPETITION_VALUATION_CLAIM_FAILED" };

    const raw = Array.isArray(data) ? data[0] : data;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: "PAPER_COMPETITION_VALUATION_CLAIM_INVALID_RESULT" };
    }

    const row = raw as JsonRow;
    const claimed = row.claimed;
    const claimedAt = timestamp(row.claimed_at);
    const leaseToken = row.lease_token === null ? null : text(row.lease_token);
    const leaseExpiresAt = row.lease_expires_at === null ? null : timestamp(row.lease_expires_at);
    if (!claimedAt || (claimed !== true && claimed !== false)) {
      return { ok: false, error: "PAPER_COMPETITION_VALUATION_CLAIM_INVALID_RESULT" };
    }

    if (claimed === false) {
      if (leaseToken === null && leaseExpiresAt === null) {
        return {
          ok: true,
          claim: { claimed: false, leaseToken: null, claimedAt, leaseExpiresAt: null },
        };
      }
      return { ok: false, error: "PAPER_COMPETITION_VALUATION_CLAIM_INVALID_RESULT" };
    }

    if (claimed === true) {
      if (
        leaseToken
        && UUID_PATTERN.test(leaseToken)
        && leaseExpiresAt
        && Date.parse(leaseExpiresAt) > Date.parse(claimedAt)
      ) {
        return {
          ok: true,
          claim: { claimed: true, leaseToken, claimedAt, leaseExpiresAt },
        };
      }
      return { ok: false, error: "PAPER_COMPETITION_VALUATION_CLAIM_INVALID_RESULT" };
    }

    return { ok: false, error: "PAPER_COMPETITION_VALUATION_CLAIM_INVALID_RESULT" };
  } catch {
    return { ok: false, error: "PAPER_COMPETITION_VALUATION_CLAIM_FAILED" };
  }
}

/**
 * Claims one DB-owned private-league valuation window. The private RPC owns the
 * competition-kind check while this adapter keeps the same strict result shape
 * as the challenge path and accepts only the competition id.
 */
export async function claimPrivatePaperLeagueValuationV3(
  competitionIdInput: string,
): Promise<PaperCompetitionValuationClaimResultV3> {
  const competitionId = competitionIdInput.trim();
  if (!UUID_PATTERN.test(competitionId)) {
    return { ok: false, error: "PAPER_COMPETITION_VALUATION_CLAIM_INVALID_INPUT" };
  }

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const { data, error } = await supabase.rpc("claim_private_paper_league_valuation_v3", {
      p_competition_id: competitionId,
    });
    if (error) return { ok: false, error: "PAPER_COMPETITION_VALUATION_CLAIM_FAILED" };

    const raw = Array.isArray(data) ? data[0] : data;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: "PAPER_COMPETITION_VALUATION_CLAIM_INVALID_RESULT" };
    }

    const row = raw as JsonRow;
    const claimed = row.claimed;
    const claimedAt = timestamp(row.claimed_at);
    const leaseToken = row.lease_token === null ? null : text(row.lease_token);
    const leaseExpiresAt = row.lease_expires_at === null ? null : timestamp(row.lease_expires_at);
    if (!claimedAt || (claimed !== true && claimed !== false)) {
      return { ok: false, error: "PAPER_COMPETITION_VALUATION_CLAIM_INVALID_RESULT" };
    }

    if (claimed === false) {
      if (leaseToken === null && leaseExpiresAt === null) {
        return {
          ok: true,
          claim: { claimed: false, leaseToken: null, claimedAt, leaseExpiresAt: null },
        };
      }
      return { ok: false, error: "PAPER_COMPETITION_VALUATION_CLAIM_INVALID_RESULT" };
    }

    if (claimed === true) {
      if (
        leaseToken
        && UUID_PATTERN.test(leaseToken)
        && leaseExpiresAt
        && Date.parse(leaseExpiresAt) > Date.parse(claimedAt)
      ) {
        return {
          ok: true,
          claim: { claimed: true, leaseToken, claimedAt, leaseExpiresAt },
        };
      }
      return { ok: false, error: "PAPER_COMPETITION_VALUATION_CLAIM_INVALID_RESULT" };
    }

    return { ok: false, error: "PAPER_COMPETITION_VALUATION_CLAIM_INVALID_RESULT" };
  } catch {
    return { ok: false, error: "PAPER_COMPETITION_VALUATION_CLAIM_FAILED" };
  }
}

/**
 * Claims the immutable final competition cutoff. The database derives that
 * cutoff from competition ends_at and owns all status, kind, lease and retry
 * policy; the server caller supplies only the trusted competition id.
 */
export async function claimFinalPaperCompetitionValuationV3(
  competitionIdInput: string,
): Promise<PaperCompetitionFinalValuationClaimResultV3> {
  const competitionId = competitionIdInput.trim();
  if (!UUID_PATTERN.test(competitionId)) {
    return { ok: false, error: "PAPER_COMPETITION_FINAL_VALUATION_CLAIM_INVALID_INPUT" };
  }

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const { data, error } = await supabase.rpc("claim_final_paper_competition_valuation_v3", {
      p_competition_id: competitionId,
    });
    if (error) return { ok: false, error: "PAPER_COMPETITION_FINAL_VALUATION_CLAIM_FAILED" };

    const raw = Array.isArray(data) ? data[0] : data;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: "PAPER_COMPETITION_FINAL_VALUATION_CLAIM_INVALID_RESULT" };
    }

    const row = raw as JsonRow;
    const claimed = row.claimed;
    const claimedAt = timestamp(row.claimed_at);
    const leaseToken = row.lease_token === null ? null : text(row.lease_token);
    const leaseExpiresAt = row.lease_expires_at === null ? null : timestamp(row.lease_expires_at);
    if (!claimedAt || (claimed !== true && claimed !== false)) {
      return { ok: false, error: "PAPER_COMPETITION_FINAL_VALUATION_CLAIM_INVALID_RESULT" };
    }

    if (claimed === false) {
      if (leaseToken === null && leaseExpiresAt === null) {
        return {
          ok: true,
          claim: { claimed: false, leaseToken: null, claimedAt, leaseExpiresAt: null },
        };
      }
      return { ok: false, error: "PAPER_COMPETITION_FINAL_VALUATION_CLAIM_INVALID_RESULT" };
    }

    if (
      leaseToken
      && UUID_PATTERN.test(leaseToken)
      && leaseExpiresAt
      && Date.parse(leaseExpiresAt) > Date.parse(claimedAt)
    ) {
      return {
        ok: true,
        claim: { claimed: true, leaseToken, claimedAt, leaseExpiresAt },
      };
    }

    return { ok: false, error: "PAPER_COMPETITION_FINAL_VALUATION_CLAIM_INVALID_RESULT" };
  } catch {
    return { ok: false, error: "PAPER_COMPETITION_FINAL_VALUATION_CLAIM_FAILED" };
  }
}

/**
 * Completes exactly the lease that established a valuation cutoff. The database
 * remains authoritative for token ownership and cutoff equality; this adapter
 * only validates/normalizes the server-side evidence before invoking the RPC.
 */
export async function completePaperCompetitionValuationV3(input: {
  competitionId: string;
  leaseToken: string;
  evaluationCutoff: string;
  outcome: PaperCompetitionValuationCompletionOutcomeV3;
}): Promise<PaperCompetitionValuationCompleteResultV3> {
  const competitionId = input.competitionId.trim();
  const leaseToken = input.leaseToken.trim();
  const evaluationCutoff = timestamp(input.evaluationCutoff);
  const outcome = input.outcome;

  if (
    !UUID_PATTERN.test(competitionId)
    || !UUID_PATTERN.test(leaseToken)
    || !evaluationCutoff
    || !(["verified", "unavailable", "error"] as const).includes(outcome)
  ) {
    return { ok: false, error: "PAPER_COMPETITION_VALUATION_COMPLETE_INVALID_INPUT" };
  }

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, error: "SUPABASE_ADMIN_NOT_CONFIGURED" };

  try {
    const { data, error } = await supabase.rpc("complete_paper_competition_valuation_v3", {
      p_competition_id: competitionId,
      p_lease_token: leaseToken,
      p_evaluation_cutoff: evaluationCutoff,
      p_outcome: outcome,
    });
    if (error) return { ok: false, error: "PAPER_COMPETITION_VALUATION_COMPLETE_FAILED" };
    if (data === true) return { ok: true, completed: true };
    if (data === false) return { ok: false, error: "PAPER_COMPETITION_VALUATION_COMPLETE_REJECTED" };
    return { ok: false, error: "PAPER_COMPETITION_VALUATION_COMPLETE_INVALID_RESULT" };
  } catch {
    return { ok: false, error: "PAPER_COMPETITION_VALUATION_COMPLETE_FAILED" };
  }
}
