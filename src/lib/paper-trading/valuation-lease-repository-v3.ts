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
 * Claims one DB-owned competition valuation window. No caller-controlled clock,
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
