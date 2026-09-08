export type InvestmentCompanyDirectorGovernanceEvidence = {
  name: string;
  independentFromCompanyManagement?: boolean | null;
  independentFromMajorShareholders?: boolean | null;
};

export type InvestmentCompanyGovernanceFailureReason =
  | "insufficient_board_evidence"
  | "incomplete_independence_evidence"
  | "duplicate_director_evidence";

export type InvestmentCompanyGovernanceResult = {
  score: number | null;
  reason: InvestmentCompanyGovernanceFailureReason | null;
  directorCount: number;
  independentFromCompanyManagementCount: number | null;
  independentFromMajorShareholdersCount: number | null;
  companyManagementIndependenceRatio: number | null;
  majorShareholderIndependenceRatio: number | null;
};

function normalizeDirectorName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function failure(
  reason: InvestmentCompanyGovernanceFailureReason,
  directorCount: number,
): InvestmentCompanyGovernanceResult {
  return {
    score: null,
    reason,
    directorCount,
    independentFromCompanyManagementCount: null,
    independentFromMajorShareholdersCount: null,
    companyManagementIndependenceRatio: null,
    majorShareholderIndependenceRatio: null,
  };
}

export function deriveInvestmentCompanyGovernance(
  directors: InvestmentCompanyDirectorGovernanceEvidence[] | null | undefined,
): InvestmentCompanyGovernanceResult {
  const evidence = [...(directors ?? [])];
  if (evidence.length === 0) return failure("insufficient_board_evidence", 0);

  const normalizedNames = evidence.map((director) => normalizeDirectorName(director.name));
  if (normalizedNames.some((name) => name.length === 0)) {
    return failure("incomplete_independence_evidence", evidence.length);
  }
  if (new Set(normalizedNames).size !== normalizedNames.length) {
    return failure("duplicate_director_evidence", evidence.length);
  }

  const complete = evidence.every((director) => (
    typeof director.independentFromCompanyManagement === "boolean"
    && typeof director.independentFromMajorShareholders === "boolean"
  ));
  if (!complete) return failure("incomplete_independence_evidence", evidence.length);

  const independentFromCompanyManagementCount = evidence.filter(
    (director) => director.independentFromCompanyManagement === true,
  ).length;
  const independentFromMajorShareholdersCount = evidence.filter(
    (director) => director.independentFromMajorShareholders === true,
  ).length;
  const companyManagementIndependenceRatio = independentFromCompanyManagementCount / evidence.length;
  const majorShareholderIndependenceRatio = independentFromMajorShareholdersCount / evidence.length;
  const score = ((companyManagementIndependenceRatio + majorShareholderIndependenceRatio) / 2) * 100;

  return {
    score,
    reason: null,
    directorCount: evidence.length,
    independentFromCompanyManagementCount,
    independentFromMajorShareholdersCount,
    companyManagementIndependenceRatio,
    majorShareholderIndependenceRatio,
  };
}
