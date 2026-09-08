import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const DEFAULT_GLOBAL_AUDIT_GATE = Object.freeze({
  minimumDiscoveryRate: 0.995,
  minimumSupportCoverageRate: 0.99,
  minimumCompletionRate: 0.99,
  minimumSpecialistCoverageTargetRate: 0.99,
  minimumGroupSize: 20,
});

function finiteRate(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function thresholdViolation(label, value, threshold) {
  const normalized = finiteRate(value);
  if (normalized === null) return `${label} is unavailable; required minimum is ${threshold.toFixed(4)}.`;
  return normalized < threshold
    ? `${label} ${normalized.toFixed(4)} is below ${threshold.toFixed(4)}.`
    : null;
}

function evaluateSummary(label, summary, thresholds) {
  const violations = [];
  const discovery = thresholdViolation(`${label} discovery rate`, summary?.discoveryRate, thresholds.minimumDiscoveryRate);
  const support = thresholdViolation(`${label} support coverage rate`, summary?.supportCoverageRate, thresholds.minimumSupportCoverageRate);
  const completion = thresholdViolation(`${label} completion rate`, summary?.completionRate, thresholds.minimumCompletionRate);
  if (discovery) violations.push(discovery);
  if (support) violations.push(support);
  if (completion) violations.push(completion);
  return violations;
}

function requireEmptyIntegrityList(integrity, key, violationLabel, violations) {
  const value = integrity?.[key];
  if (!Array.isArray(value)) {
    violations.push(`Global audit integrity payload is missing ${key}.`);
  } else if (value.length > 0) {
    violations.push(`${violationLabel}: ${value.join(", ")}.`);
  }
}

export function evaluateGlobalAuditGate(kpis, thresholds = DEFAULT_GLOBAL_AUDIT_GATE) {
  const violations = [];
  if (!kpis || typeof kpis !== "object") {
    return { pass: false, violations: ["Global audit KPI payload is missing."] };
  }

  if (!kpis.overall || !Number.isFinite(kpis.overall.input) || kpis.overall.input <= 0) {
    violations.push("Global audit cannot pass with an empty universe.");
  } else {
    violations.push(...evaluateSummary("Overall", kpis.overall, thresholds));
  }

  const specialist = kpis.specialist;
  if (!specialist || !Number.isFinite(specialist.input) || specialist.input <= 0) {
    violations.push("Global audit must include specialist securities.");
  } else if (!Number.isFinite(specialist.targetEligible) || specialist.targetEligible <= 0) {
    violations.push("Global audit has no specialist securities with measurable coverage.");
  } else {
    const specialistViolation = thresholdViolation(
      "Specialist 99% coverage-target attainment rate",
      specialist.coverageTargetRate,
      thresholds.minimumSpecialistCoverageTargetRate,
    );
    if (specialistViolation) violations.push(specialistViolation);
  }

  const integrity = kpis.integrity ?? {};
  requireEmptyIntegrityList(integrity, "ratingBelowCoverageTarget", "Ratings were emitted below specialist coverage target", violations);
  requireEmptyIntegrityList(integrity, "noRatingAtOrAboveCoverageTargetWithScore", "No Rating reports retained canonical scores", violations);
  requireEmptyIntegrityList(integrity, "analysisEngineErrors", "Analysis engine errors were observed", violations);
  requireEmptyIntegrityList(integrity, "scoreRatingMismatches", "Canonical score/rating mismatches were observed", violations);

  for (const [dimension, groups] of [["market", kpis.byMarket], ["security type", kpis.bySecurityType]]) {
    if (!groups || typeof groups !== "object") {
      violations.push(`Global audit is missing per-${dimension} coverage groups.`);
      continue;
    }
    for (const [name, summary] of Object.entries(groups)) {
      if (!Number.isFinite(summary?.input) || summary.input < thresholds.minimumGroupSize) continue;
      violations.push(...evaluateSummary(`${dimension} ${name}`, summary, thresholds));
    }
  }

  return { pass: violations.length === 0, violations };
}

function numberFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function gateThresholdsFromEnv() {
  return {
    minimumDiscoveryRate: numberFromEnv("STOCKBOX_GATE_MIN_DISCOVERY", DEFAULT_GLOBAL_AUDIT_GATE.minimumDiscoveryRate),
    minimumSupportCoverageRate: numberFromEnv("STOCKBOX_GATE_MIN_SUPPORT", DEFAULT_GLOBAL_AUDIT_GATE.minimumSupportCoverageRate),
    minimumCompletionRate: numberFromEnv("STOCKBOX_GATE_MIN_COMPLETION", DEFAULT_GLOBAL_AUDIT_GATE.minimumCompletionRate),
    minimumSpecialistCoverageTargetRate: numberFromEnv("STOCKBOX_GATE_MIN_SPECIALIST_COVERAGE", DEFAULT_GLOBAL_AUDIT_GATE.minimumSpecialistCoverageTargetRate),
    minimumGroupSize: numberFromEnv("STOCKBOX_GATE_MIN_GROUP_SIZE", DEFAULT_GLOBAL_AUDIT_GATE.minimumGroupSize),
  };
}

export function evaluateGlobalAuditFile(file, thresholds = gateThresholdsFromEnv()) {
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  return evaluateGlobalAuditGate(parsed?.summary?.kpis, thresholds);
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/diagnostics/evaluate-global-audit-gate.mjs <audit.json>");
    process.exitCode = 2;
  } else {
    const result = evaluateGlobalAuditFile(file);
    if (!result.pass) {
      console.error("StockBox global coverage release gate FAILED:");
      for (const violation of result.violations) console.error(`- ${violation}`);
      process.exitCode = 1;
    } else {
      console.log("StockBox global coverage release gate PASSED.");
    }
  }
}
