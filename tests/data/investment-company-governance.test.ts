import { describe, expect, it } from "vitest";

import {
  deriveInvestmentCompanyGovernance,
  type InvestmentCompanyDirectorGovernanceEvidence,
} from "../../src/lib/data/investment-company-governance";

const verifiedIndustrivarden2026: InvestmentCompanyDirectorGovernanceEvidence[] = [
  { name: "Fredrik Lundberg", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
  { name: "Pär Boman", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Christian Caspar", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Marika Fredriksson", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Bengt Kjell", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Katarina Martinson", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
  { name: "Fredrik Persson", independentFromCompanyManagement: true, independentFromMajorShareholders: true },
  { name: "Lars Pettersson", independentFromCompanyManagement: true, independentFromMajorShareholders: false },
  { name: "Helena Stjernholm", independentFromCompanyManagement: false, independentFromMajorShareholders: true },
];

describe("investment-company governance scoring", () => {
  it("scores complete official board-independence evidence without converting policy existence into a perfect score", () => {
    const result = deriveInvestmentCompanyGovernance(verifiedIndustrivarden2026);

    expect(result.reason).toBeNull();
    expect(result.directorCount).toBe(9);
    expect(result.independentFromCompanyManagementCount).toBe(8);
    expect(result.independentFromMajorShareholdersCount).toBe(6);
    expect(result.companyManagementIndependenceRatio).toBeCloseTo(8 / 9, 12);
    expect(result.majorShareholderIndependenceRatio).toBeCloseTo(6 / 9, 12);
    expect(result.score).toBeCloseTo((((8 / 9) + (6 / 9)) / 2) * 100, 12);
  });

  it("fails closed when any director is missing either independence assessment", () => {
    const incomplete = verifiedIndustrivarden2026.map((director) => ({ ...director }));
    incomplete[2] = {
      ...incomplete[2],
      independentFromMajorShareholders: undefined,
    };

    const result = deriveInvestmentCompanyGovernance(incomplete);

    expect(result.score).toBeNull();
    expect(result.reason).toBe("incomplete_independence_evidence");
  });

  it("fails closed on duplicate director evidence instead of double-counting an independence vote", () => {
    const duplicated = [...verifiedIndustrivarden2026, verifiedIndustrivarden2026[0]];

    const result = deriveInvestmentCompanyGovernance(duplicated);

    expect(result.score).toBeNull();
    expect(result.reason).toBe("duplicate_director_evidence");
  });
});
