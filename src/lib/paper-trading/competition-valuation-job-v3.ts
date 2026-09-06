import {
  loadPaperCompetitionKindV3,
  type PaperCompetitionKindResultV3,
} from "./competition-kind-repository-v3";
import {
  runPaperCompetitionValuationServiceV3,
  runPrivatePaperLeagueValuationServiceV3,
  type PaperCompetitionValuationServiceResultV3,
} from "./competition-valuation-service-v3";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PaperCompetitionValuationJobInputV3 = {
  competitionId: string;
};

export type PaperCompetitionValuationJobInputResultV3 =
  | { ok: true; input: PaperCompetitionValuationJobInputV3 }
  | { ok: false; error: "INVALID_INPUT" };

export type PaperCompetitionValuationJobDependenciesV3 = {
  loadCompetitionKind: (competitionId: string) => Promise<PaperCompetitionKindResultV3 | { ok: false; error: string }>;
  runChallengeValuation: (input: PaperCompetitionValuationJobInputV3) => Promise<PaperCompetitionValuationServiceResultV3>;
  runPrivateLeagueValuation: (input: PaperCompetitionValuationJobInputV3) => Promise<PaperCompetitionValuationServiceResultV3>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePaperCompetitionValuationJobInputV3(
  value: unknown,
): PaperCompetitionValuationJobInputResultV3 {
  if (!isRecord(value)) return { ok: false, error: "INVALID_INPUT" };

  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "competitionId") {
    return { ok: false, error: "INVALID_INPUT" };
  }

  if (typeof value.competitionId !== "string") {
    return { ok: false, error: "INVALID_INPUT" };
  }

  const competitionId = value.competitionId.trim();
  if (!UUID_PATTERN.test(competitionId)) {
    return { ok: false, error: "INVALID_INPUT" };
  }

  return { ok: true, input: { competitionId } };
}

export async function runPaperCompetitionValuationJobV3(
  input: PaperCompetitionValuationJobInputV3,
  dependencies: PaperCompetitionValuationJobDependenciesV3 = {
    loadCompetitionKind: loadPaperCompetitionKindV3,
    runChallengeValuation: runPaperCompetitionValuationServiceV3,
    runPrivateLeagueValuation: runPrivatePaperLeagueValuationServiceV3,
  },
): Promise<PaperCompetitionValuationServiceResultV3> {
  const parsed = parsePaperCompetitionValuationJobInputV3(input);
  if (!parsed.ok) return { status: "INVALID_INPUT" };

  let kindResult: Awaited<ReturnType<PaperCompetitionValuationJobDependenciesV3["loadCompetitionKind"]>>;
  try {
    kindResult = await dependencies.loadCompetitionKind(parsed.input.competitionId);
  } catch {
    return { status: "ERROR" };
  }

  if (!kindResult.ok) return { status: "ERROR" };

  try {
    if (kindResult.kind === "challenge") {
      return await dependencies.runChallengeValuation(parsed.input);
    }
    if (kindResult.kind === "private_league") {
      return await dependencies.runPrivateLeagueValuation(parsed.input);
    }
    return { status: "ERROR" };
  } catch {
    return { status: "ERROR" };
  }
}
