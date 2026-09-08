export type AuditRateSummary = {
  input: number;
  discovered?: number;
  supported?: number;
  completed?: number;
  rated?: number;
  noRating?: number;
  discoveryRate?: number | null;
  supportCoverageRate?: number | null;
  completionRate?: number | null;
  ratingRate?: number | null;
  noRatingRate?: number | null;
};

export type GlobalAuditGateKpis = {
  overall?: AuditRateSummary;
  specialist?: {
    input?: number;
    completed?: number;
    targetEligible?: number;
    meets99PercentCoverage?: number;
    coverageTargetRate?: number | null;
  };
  integrity?: {
    ratingBelowCoverageTarget?: string[];
    noRatingAtOrAboveCoverageTargetWithScore?: string[];
  };
  byMarket?: Record<string, AuditRateSummary>;
  bySecurityType?: Record<string, AuditRateSummary>;
};

export type GlobalAuditGateThresholds = {
  minimumDiscoveryRate: number;
  minimumSupportCoverageRate: number;
  minimumCompletionRate: number;
  minimumSpecialistCoverageTargetRate: number;
  minimumGroupSize: number;
};

export const DEFAULT_GLOBAL_AUDIT_GATE: Readonly<GlobalAuditGateThresholds>;

export function evaluateGlobalAuditGate(
  kpis: GlobalAuditGateKpis | null | undefined,
  thresholds?: GlobalAuditGateThresholds,
): { pass: boolean; violations: string[] };

export function gateThresholdsFromEnv(): GlobalAuditGateThresholds;

export function evaluateGlobalAuditFile(
  file: string,
  thresholds?: GlobalAuditGateThresholds,
): { pass: boolean; violations: string[] };
