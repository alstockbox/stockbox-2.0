import { STATIC_BENCHMARK_VERSION, benchmarksForSector } from "./config";
import type { AnalysisReport } from "./types";

export type PeerBenchmarkDirection = "higher_is_better" | "lower_is_better";
export type PeerBenchmarkStatus = "strong" | "weak" | "in_range" | "unavailable";

export type PeerBenchmarkRow = {
  key: string;
  label: string;
  group: "valuation" | "growth" | "profitability" | "financialHealth";
  value: number | null;
  kind: "percent" | "multiple";
  direction: PeerBenchmarkDirection;
  attractiveOrStrong: number;
  expensiveOrWeak: number;
  status: PeerBenchmarkStatus;
  note: string;
};

export type PeerBenchmarkComparison = {
  status: "benchmark_only" | "unavailable";
  sectorLabel: string;
  benchmarkVersion: string;
  rows: PeerBenchmarkRow[];
  missingReasons: string[];
  summary: string;
};

export type BenchmarkValuationScore = {
  score: number | null;
  coverage: number;
  availableMetrics: number;
  detail: string;
  benchmarkVersion: string;
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function statusFor(
  value: number | null | undefined,
  direction: PeerBenchmarkDirection,
  attractiveOrStrong: number,
  expensiveOrWeak: number,
): PeerBenchmarkStatus {
  if (!finite(value)) return "unavailable";
  if (direction === "higher_is_better") {
    if (value >= attractiveOrStrong) return "strong";
    if (value <= expensiveOrWeak) return "weak";
    return "in_range";
  }
  if (value <= attractiveOrStrong) return "strong";
  if (value >= expensiveOrWeak) return "weak";
  return "in_range";
}

function row(input: Omit<PeerBenchmarkRow, "status" | "note">): PeerBenchmarkRow {
  const status = statusFor(input.value, input.direction, input.attractiveOrStrong, input.expensiveOrWeak);
  const note = status === "unavailable"
    ? "Company value is unavailable, so StockBox does not infer a peer-relative view."
    : "Compared with StockBox's versioned static sector benchmark; this is not a live peer median.";
  return { ...input, status, note };
}

export function buildPeerBenchmarkComparison(report: AnalysisReport): PeerBenchmarkComparison {
  const metrics = report.engine?.metrics;
  const sector = report.engine?.scores.sector;
  const benchmarks = benchmarksForSector(sector);
  const sectorLabel = sector ?? "other";
  const benchmarkVersion = report.engine?.scores.methodology.benchmarkVersion ?? STATIC_BENCHMARK_VERSION;

  if (!metrics) {
    return {
      status: "unavailable",
      sectorLabel,
      benchmarkVersion,
      rows: [],
      missingReasons: ["Canonical financial metrics are unavailable for this saved report."],
      summary: "Peer and benchmark comparison is unavailable because StockBox does not have traceable metrics for this report.",
    };
  }

  if (report.engine?.analysisArchetype === "holding_company") {
    return {
      status: "unavailable",
      sectorLabel,
      benchmarkVersion,
      rows: [],
      missingReasons: [
        "Holding-company peer valuation requires verified look-through NAV or SOTP data and a comparable NAV discount/premium benchmark.",
        "Generic operating-company P/E, EV/EBITDA, EV/Sales, FCF-yield, revenue-growth and margin benchmarks are intentionally suppressed for holding companies.",
      ],
      summary: "Generic sector benchmarks are not used for holding companies because NAV/SOTP and discount-to-NAV are the economically relevant comparison basis.",
    };
  }

  const rows: PeerBenchmarkRow[] = [
    row({ key: "pe", label: "P/E", group: "valuation", value: metrics.valuation.priceEarnings ?? null, kind: "multiple", direction: "lower_is_better", attractiveOrStrong: benchmarks.peAttractive, expensiveOrWeak: benchmarks.peExpensive }),
    row({ key: "evEbitda", label: "EV / EBITDA", group: "valuation", value: metrics.valuation.evEbitda ?? null, kind: "multiple", direction: "lower_is_better", attractiveOrStrong: benchmarks.evEbitdaAttractive, expensiveOrWeak: benchmarks.evEbitdaExpensive }),
    row({ key: "evSales", label: "EV / Sales", group: "valuation", value: metrics.valuation.evSales ?? null, kind: "multiple", direction: "lower_is_better", attractiveOrStrong: benchmarks.evSalesAttractive, expensiveOrWeak: benchmarks.evSalesExpensive }),
    row({ key: "fcfYield", label: "FCF yield", group: "valuation", value: metrics.valuation.freeCashFlowYield ?? null, kind: "percent", direction: "higher_is_better", attractiveOrStrong: benchmarks.fcfYieldStrong, expensiveOrWeak: benchmarks.fcfYieldWeak }),
    row({ key: "revenueGrowth", label: "Revenue growth", group: "growth", value: metrics.growth.revenueGrowthYoY ?? null, kind: "percent", direction: "higher_is_better", attractiveOrStrong: benchmarks.revenueGrowthStrong, expensiveOrWeak: benchmarks.revenueGrowthWeak }),
    row({ key: "operatingMargin", label: "Operating margin", group: "profitability", value: metrics.margins.operatingMargin ?? null, kind: "percent", direction: "higher_is_better", attractiveOrStrong: benchmarks.operatingMarginStrong, expensiveOrWeak: benchmarks.operatingMarginWeak }),
    row({ key: "roic", label: "ROIC", group: "profitability", value: metrics.ratios.returnOnInvestedCapital ?? null, kind: "percent", direction: "higher_is_better", attractiveOrStrong: benchmarks.roicStrong, expensiveOrWeak: benchmarks.roicWeak }),
    row({ key: "netDebtEbitda", label: "Net debt / EBITDA", group: "financialHealth", value: metrics.ratios.netDebtToEbitda ?? null, kind: "multiple", direction: "lower_is_better", attractiveOrStrong: benchmarks.netDebtToEbitdaStrong, expensiveOrWeak: benchmarks.netDebtToEbitdaWeak }),
    row({ key: "interestCoverage", label: "Interest coverage", group: "financialHealth", value: metrics.ratios.interestCoverage ?? null, kind: "multiple", direction: "higher_is_better", attractiveOrStrong: benchmarks.interestCoverageStrong, expensiveOrWeak: benchmarks.interestCoverageWeak }),
  ];

  const available = rows.filter((item) => item.status !== "unavailable");
  const strong = rows.filter((item) => item.status === "strong").length;
  const weak = rows.filter((item) => item.status === "weak").length;
  const missingReasons = rows.filter((item) => item.status === "unavailable").map((item) => `${item.label}: company metric unavailable.`);

  return {
    status: "benchmark_only",
    sectorLabel,
    benchmarkVersion,
    rows,
    missingReasons: ["Live peer constituents and live peer medians are not configured for this local report.", ...missingReasons],
    summary: available.length
      ? `${strong} metrics screen strong versus the sector benchmark, ${weak} screen weak, and ${available.length - strong - weak} sit inside the benchmark range.`
      : "No peer-readable metrics are available, so StockBox does not infer a relative positioning view.",
  };
}

export function buildBenchmarkValuationScore(report: AnalysisReport): BenchmarkValuationScore {
  const comparison = buildPeerBenchmarkComparison(report);
  if (comparison.status === "unavailable") {
    return {
      score: null,
      coverage: 0,
      availableMetrics: 0,
      detail: comparison.summary,
      benchmarkVersion: comparison.benchmarkVersion,
    };
  }

  const valuationRows = comparison.rows.filter((item) => item.group === "valuation");
  const available = valuationRows.filter((item) => item.status !== "unavailable");
  const coverage = valuationRows.length ? available.length / valuationRows.length : 0;
  if (available.length < 2 || coverage < 0.5) {
    return {
      score: null,
      coverage,
      availableMetrics: available.length,
      detail: "Sector benchmark valuation needs at least two traceable valuation metrics; StockBox will not infer mispricing from one multiple. This is not a live peer median.",
      benchmarkVersion: comparison.benchmarkVersion,
    };
  }

  const scoreByStatus: Record<Exclude<PeerBenchmarkStatus, "unavailable">, number> = {
    strong: 85,
    in_range: 50,
    weak: 20,
  };
  const score = available.reduce((sum, item) => sum + scoreByStatus[item.status as Exclude<PeerBenchmarkStatus, "unavailable">], 0) / available.length;
  const strong = available.filter((item) => item.status === "strong").length;
  const weak = available.filter((item) => item.status === "weak").length;
  return {
    score,
    coverage,
    availableMetrics: available.length,
    detail: `${strong} of ${available.length} available valuation metrics screen attractive and ${weak} screen expensive versus StockBox's versioned sector benchmark. This is not a live peer median.`,
    benchmarkVersion: comparison.benchmarkVersion,
  };
}
