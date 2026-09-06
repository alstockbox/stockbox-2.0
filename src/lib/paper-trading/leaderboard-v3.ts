import type { PaperPerformanceSnapshotRowV3 } from "./performance-repository-v3";

export type PaperCompetitionLeaderboardEntryV3 = {
  competitionId: string;
  userId: string;
  accountId: string;
  accountType: "competition";
  joinedAt: string;
};

export type PaperCompetitionLeaderboardUnavailableReasonV3 =
  | "SNAPSHOT_MISSING"
  | "SNAPSHOT_MISMATCH";

export type PaperCompetitionLeaderboardStandingV3 =
  | {
      status: "RANKED";
      competitionId: string;
      userId: string;
      accountId: string;
      joinedAt: string;
      rank: number;
      returnPercent: number;
      equity: number;
      evaluatedAt: string;
    }
  | {
      status: "UNAVAILABLE";
      competitionId: string;
      userId: string;
      accountId: string;
      joinedAt: string;
      rank: null;
      returnPercent: null;
      equity: null;
      evaluatedAt: string;
      reason: PaperCompetitionLeaderboardUnavailableReasonV3;
    };

export type PaperCompetitionLeaderboardResultV3 =
  | {
      ok: true;
      competitionId: string;
      baseCurrency: string;
      evaluationCutoff: string;
      standings: PaperCompetitionLeaderboardStandingV3[];
      rankedCount: number;
      unavailableCount: number;
    }
  | {
      ok: false;
      error: "INVALID_COMPETITION" | "DUPLICATE_PARTICIPANT";
      standings: [];
    };

function normalizeIdentity(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeCurrency(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function unavailable(
  entry: PaperCompetitionLeaderboardEntryV3,
  evaluationCutoff: string,
  reason: PaperCompetitionLeaderboardUnavailableReasonV3,
): Extract<PaperCompetitionLeaderboardStandingV3, { status: "UNAVAILABLE" }> {
  return {
    status: "UNAVAILABLE",
    competitionId: entry.competitionId,
    userId: entry.userId,
    accountId: entry.accountId,
    joinedAt: entry.joinedAt,
    rank: null,
    returnPercent: null,
    equity: null,
    evaluatedAt: evaluationCutoff,
    reason,
  };
}

/**
 * Ranks only dedicated competition accounts that have a verified persisted
 * performance snapshot at the exact same evaluation cutoff and in the exact
 * same competition currency. Missing or incomparable evidence is represented
 * as unavailable and never receives an estimated score.
 */
export function derivePaperCompetitionLeaderboardV3(input: {
  competitionId: string;
  baseCurrency: string;
  evaluationCutoff: string;
  entries: readonly PaperCompetitionLeaderboardEntryV3[];
  snapshots: readonly PaperPerformanceSnapshotRowV3[];
}): PaperCompetitionLeaderboardResultV3 {
  const competitionId = normalizeIdentity(input.competitionId);
  const baseCurrency = normalizeCurrency(input.baseCurrency);
  const cutoffMs = Date.parse(input.evaluationCutoff);
  if (!competitionId || !baseCurrency || !Number.isFinite(cutoffMs)) {
    return { ok: false, error: "INVALID_COMPETITION", standings: [] };
  }
  const evaluationCutoff = new Date(cutoffMs).toISOString();

  const seenUsers = new Set<string>();
  const seenAccounts = new Set<string>();
  for (const entry of input.entries) {
    const userId = normalizeIdentity(entry.userId);
    const accountId = normalizeIdentity(entry.accountId);
    const joinedAtMs = Date.parse(entry.joinedAt);
    if (
      entry.competitionId !== competitionId
      || entry.accountType !== "competition"
      || !userId
      || !accountId
      || !Number.isFinite(joinedAtMs)
    ) {
      return { ok: false, error: "INVALID_COMPETITION", standings: [] };
    }
    if (seenUsers.has(userId) || seenAccounts.has(accountId)) {
      return { ok: false, error: "DUPLICATE_PARTICIPANT", standings: [] };
    }
    seenUsers.add(userId);
    seenAccounts.add(accountId);
  }

  const snapshotsByAccount = new Map<string, PaperPerformanceSnapshotRowV3[]>();
  for (const snapshot of input.snapshots) {
    const accountId = normalizeIdentity(snapshot.accountId);
    if (!accountId) continue;
    const current = snapshotsByAccount.get(accountId) ?? [];
    current.push(snapshot);
    snapshotsByAccount.set(accountId, current);
  }

  const rankedCandidates: Extract<PaperCompetitionLeaderboardStandingV3, { status: "RANKED" }>[] = [];
  const unavailableStandings: Extract<PaperCompetitionLeaderboardStandingV3, { status: "UNAVAILABLE" }>[] = [];

  for (const entry of input.entries) {
    const candidates = snapshotsByAccount.get(entry.accountId) ?? [];
    if (candidates.length === 0) {
      unavailableStandings.push(unavailable(entry, evaluationCutoff, "SNAPSHOT_MISSING"));
      continue;
    }

    const exactCutoffCandidates = candidates.filter(
      (snapshot) => Number.isFinite(Date.parse(snapshot.evaluatedAt)) && Date.parse(snapshot.evaluatedAt) === cutoffMs,
    );
    if (exactCutoffCandidates.length !== 1) {
      unavailableStandings.push(unavailable(entry, evaluationCutoff, "SNAPSHOT_MISMATCH"));
      continue;
    }

    const snapshot = exactCutoffCandidates[0];
    if (
      snapshot.userId !== entry.userId
      || snapshot.accountId !== entry.accountId
      || Date.parse(snapshot.evaluatedAt) !== cutoffMs
      || snapshot.baseCurrency !== baseCurrency
      || snapshot.startingCash !== 100_000
      || !Number.isFinite(snapshot.returnPercent)
      || !Number.isFinite(snapshot.equity)
      || snapshot.equity < 0
    ) {
      unavailableStandings.push(unavailable(entry, evaluationCutoff, "SNAPSHOT_MISMATCH"));
      continue;
    }

    rankedCandidates.push({
      status: "RANKED",
      competitionId,
      userId: entry.userId,
      accountId: entry.accountId,
      joinedAt: entry.joinedAt,
      rank: 0,
      returnPercent: snapshot.returnPercent,
      equity: snapshot.equity,
      evaluatedAt: evaluationCutoff,
    });
  }

  rankedCandidates.sort((left, right) => {
    const byReturn = right.returnPercent - left.returnPercent;
    if (byReturn !== 0) return byReturn;
    const byJoinedAt = left.joinedAt.localeCompare(right.joinedAt);
    if (byJoinedAt !== 0) return byJoinedAt;
    return left.accountId.localeCompare(right.accountId);
  });

  const rankedStandings = rankedCandidates.map((current, index, ranked) => {
    if (index === 0) return { ...current, rank: 1 };
    const previous = ranked[index - 1];
    const rank = previous.returnPercent === current.returnPercent
      ? previous.rank
      : index + 1;
    return { ...current, rank };
  });

  unavailableStandings.sort((left, right) => {
    const byJoinedAt = left.joinedAt.localeCompare(right.joinedAt);
    if (byJoinedAt !== 0) return byJoinedAt;
    return left.accountId.localeCompare(right.accountId);
  });

  return {
    ok: true,
    competitionId,
    baseCurrency,
    evaluationCutoff,
    standings: [...rankedStandings, ...unavailableStandings],
    rankedCount: rankedStandings.length,
    unavailableCount: unavailableStandings.length,
  };
}