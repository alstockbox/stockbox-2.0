export type PlanId = "free" | "builder" | "pro";

export type AiCoachDepth = "none" | "brief" | "full";
export type ThesisMonitorFrequency = "none" | "weekly" | "daily";

export type StockBoxEntitlements = {
  maxActivePaperPositions: number;
  maxNewPaperTradesPerMonth: number;
  maxPortfolios: number;
  maxThesisReviewsPerMonth: number;
  aiCoachDepth: AiCoachDepth;
  investorScoreAccess: boolean;
  investorDnaAccess: boolean;
  historicalSimulationsPerMonth: number;
  smartWatchlistSlots: number;
  thesisMonitorFrequency: ThesisMonitorFrequency;
  mentorModes: string[];
  challengesAccess: boolean;
  exportAccess: boolean;
  historyWindowDays: number | null;
};

export const PLAN_ENTITLEMENTS: Record<PlanId, StockBoxEntitlements> = {
  free: {
    maxActivePaperPositions: 5,
    maxNewPaperTradesPerMonth: 10,
    maxPortfolios: 1,
    maxThesisReviewsPerMonth: 3,
    aiCoachDepth: "brief",
    investorScoreAccess: true,
    investorDnaAccess: false,
    historicalSimulationsPerMonth: 1,
    smartWatchlistSlots: 10,
    thesisMonitorFrequency: "weekly",
    mentorModes: ["quality", "value"],
    challengesAccess: true,
    exportAccess: false,
    historyWindowDays: 365
  },
  builder: {
    maxActivePaperPositions: 25,
    maxNewPaperTradesPerMonth: 50,
    maxPortfolios: 3,
    maxThesisReviewsPerMonth: 20,
    aiCoachDepth: "full",
    investorScoreAccess: true,
    investorDnaAccess: true,
    historicalSimulationsPerMonth: 10,
    smartWatchlistSlots: 50,
    thesisMonitorFrequency: "weekly",
    mentorModes: ["quality", "value", "growth", "garp", "balance_sheet"],
    challengesAccess: true,
    exportAccess: true,
    historyWindowDays: null
  },
  pro: {
    maxActivePaperPositions: 100,
    maxNewPaperTradesPerMonth: 200,
    maxPortfolios: 10,
    maxThesisReviewsPerMonth: 100,
    aiCoachDepth: "full",
    investorScoreAccess: true,
    investorDnaAccess: true,
    historicalSimulationsPerMonth: 50,
    smartWatchlistSlots: 250,
    thesisMonitorFrequency: "daily",
    mentorModes: ["quality", "value", "growth", "garp", "balance_sheet", "contrarian", "catalyst"],
    challengesAccess: true,
    exportAccess: true,
    historyWindowDays: null
  }
};

export function getPlanEntitlements(planId: PlanId): StockBoxEntitlements {
  return PLAN_ENTITLEMENTS[planId];
}
