import { isKilled } from "@/lib/feature-flags";

/**
 * Variable API-cost classification for the exact official-source adapters used
 * by watchlist monitoring as of 2026-09-05.
 *
 * This is NOT a claim that StockBox total infrastructure cost is zero. Hosting,
 * database, storage and future provider costs remain governed separately by the
 * system-wide 125 SEK/month budget cap. This allowlist only prevents a newly
 * introduced paid/unknown data provider from silently entering background
 * monitoring.
 */
export const OFFICIAL_MONITORING_FREE_PROVIDER_IDS = [
  "riksbank",
  "gleif",
  "openfigi",
  "finansinspektionen",
  "sec",
  "bolagsverket-hvd",
] as const;

export type OfficialMonitoringProviderId = typeof OFFICIAL_MONITORING_FREE_PROVIDER_IDS[number];

export type OfficialMonitoringCostDecision =
  | {
      allowed: true;
      reason: "verified_zero_variable_api_cost";
      variableApiCostSek: 0;
      providers: string[];
    }
  | {
      allowed: false;
      reason: "background_jobs_killed" | "provider_cost_review_required";
      variableApiCostSek: null;
      providers: string[];
      unknownProviders?: string[];
    };

const freeProviders = new Set<string>(OFFICIAL_MONITORING_FREE_PROVIDER_IDS);

export function evaluateOfficialMonitoringCostPolicy(
  providers: readonly string[],
  options: { backgroundJobsKilled?: boolean } = {},
): OfficialMonitoringCostDecision {
  const normalized = [...new Set(providers.map((provider) => provider.trim().toLowerCase()).filter(Boolean))].sort();
  const backgroundJobsKilled = options.backgroundJobsKilled ?? isKilled("backgroundJobs");
  if (backgroundJobsKilled) {
    return {
      allowed: false,
      reason: "background_jobs_killed",
      variableApiCostSek: null,
      providers: normalized,
    };
  }

  const unknownProviders = normalized.filter((provider) => !freeProviders.has(provider));
  if (unknownProviders.length) {
    return {
      allowed: false,
      reason: "provider_cost_review_required",
      variableApiCostSek: null,
      providers: normalized,
      unknownProviders,
    };
  }

  return {
    allowed: true,
    reason: "verified_zero_variable_api_cost",
    variableApiCostSek: 0,
    providers: normalized,
  };
}

/**
 * Provider families currently reachable from fetchOfficialResearchBundle when
 * deep research is enabled. Any future addition must be explicitly classified
 * above before durable watchlist jobs are allowed to run.
 */
export const CURRENT_OFFICIAL_MONITORING_PROVIDER_PLAN = [
  "riksbank",
  "gleif",
  "openfigi",
  "finansinspektionen",
  "sec",
  "bolagsverket-hvd",
] as const;

export function currentOfficialMonitoringCostDecision(
  options: { backgroundJobsKilled?: boolean } = {},
): OfficialMonitoringCostDecision {
  return evaluateOfficialMonitoringCostPolicy(CURRENT_OFFICIAL_MONITORING_PROVIDER_PLAN, options);
}
