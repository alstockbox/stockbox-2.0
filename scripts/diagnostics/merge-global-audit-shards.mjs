function rate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function emptyRateSummary() {
  return {
    input: 0,
    discovered: 0,
    supported: 0,
    completed: 0,
    rated: 0,
    noRating: 0,
  };
}

function addRateSummary(target, source) {
  for (const key of ["input", "discovered", "supported", "completed", "rated", "noRating"]) {
    const value = source?.[key];
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid audit KPI count for ${key}.`);
    }
    target[key] += value;
  }
  return target;
}

function finalizeRateSummary(counts) {
  return {
    ...counts,
    discoveryRate: rate(counts.discovered, counts.input),
    supportCoverageRate: rate(counts.supported, counts.discovered),
    completionRate: rate(counts.completed, counts.supported),
    ratingRate: rate(counts.rated, counts.completed),
    noRatingRate: rate(counts.noRating, counts.completed),
  };
}

function mergeRateSummaryMaps(shards, key) {
  const countsByBucket = new Map();
  for (const shard of shards) {
    const groups = shard.summary?.kpis?.[key] ?? {};
    for (const [bucket, summary] of Object.entries(groups)) {
      const counts = countsByBucket.get(bucket) ?? emptyRateSummary();
      addRateSummary(counts, summary);
      countsByBucket.set(bucket, counts);
    }
  }
  return Object.fromEntries(
    [...countsByBucket.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([bucket, counts]) => [bucket, finalizeRateSummary(counts)]),
  );
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function validateShard(shard, index) {
  if (!shard || typeof shard !== "object") throw new Error(`Invalid audit shard at index ${index}.`);
  if (!Number.isInteger(shard.offset) || shard.offset < 0) throw new Error(`Invalid audit shard offset at index ${index}.`);
  if (!Number.isInteger(shard.totalInput) || shard.totalInput < 0) throw new Error(`Invalid audit shard totalInput at index ${index}.`);
  if (!Array.isArray(shard.results)) throw new Error(`Invalid audit shard results at index ${index}.`);
  if (!Number.isInteger(shard.limit) || shard.limit < 0 || shard.limit !== shard.results.length) {
    throw new Error(`Audit shard at offset ${shard.offset} has an incomplete result slice: limit and results length differ.`);
  }
  if (typeof shard.source !== "string" || !shard.source) throw new Error(`Invalid audit shard source at index ${index}.`);
  if (!shard.summary?.kpis?.overall || !shard.summary?.kpis?.specialist || !shard.summary?.kpis?.integrity) {
    throw new Error(`Audit shard at offset ${shard.offset} is missing KPI summary data.`);
  }
}

export function mergeGlobalAuditShards(inputShards) {
  if (!Array.isArray(inputShards) || inputShards.length === 0) {
    throw new Error("At least one global audit shard is required.");
  }

  const shards = [...inputShards];
  shards.forEach(validateShard);
  shards.sort((left, right) => left.offset - right.offset);

  const source = shards[0].source;
  const totalInput = shards[0].totalInput;
  for (const shard of shards) {
    if (shard.source !== source) {
      throw new Error(`Global audit shard source mismatch: expected ${source}, received ${shard.source}.`);
    }
    if (shard.totalInput !== totalInput) {
      throw new Error(`Global audit shard totalInput mismatch: expected ${totalInput}, received ${shard.totalInput}.`);
    }
  }

  let expectedOffset = 0;
  for (const shard of shards) {
    if (shard.offset < expectedOffset) {
      throw new Error(`Global audit shard overlap at offset ${shard.offset}; expected ${expectedOffset}.`);
    }
    if (shard.offset > expectedOffset) {
      throw new Error(`Global audit shard gap before offset ${shard.offset}; expected ${expectedOffset}.`);
    }
    expectedOffset += shard.results.length;
  }
  if (expectedOffset !== totalInput) {
    throw new Error(`Global audit shard set is incomplete: merged ${expectedOffset} of ${totalInput} inputs.`);
  }

  const overallCounts = emptyRateSummary();
  const specialistCounts = {
    input: 0,
    completed: 0,
    targetEligible: 0,
    meets99PercentCoverage: 0,
  };
  const ratingBelowCoverageTarget = [];
  const noRatingAtOrAboveCoverageTargetWithScore = [];

  for (const shard of shards) {
    addRateSummary(overallCounts, shard.summary.kpis.overall);
    const specialist = shard.summary.kpis.specialist;
    for (const key of ["input", "completed", "targetEligible", "meets99PercentCoverage"]) {
      const value = specialist[key];
      if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid specialist KPI count for ${key}.`);
      specialistCounts[key] += value;
    }
    ratingBelowCoverageTarget.push(...(shard.summary.kpis.integrity.ratingBelowCoverageTarget ?? []));
    noRatingAtOrAboveCoverageTargetWithScore.push(...(shard.summary.kpis.integrity.noRatingAtOrAboveCoverageTargetWithScore ?? []));
  }

  const generatedAt = shards.map((shard) => shard.generatedAt).filter(Boolean).sort().at(-1) ?? null;
  const startedAt = shards.map((shard) => shard.startedAt).filter(Boolean).sort().at(0) ?? null;
  const duplicates = uniqueSorted(shards.flatMap((shard) => shard.duplicates ?? []));
  const invalid = uniqueSorted(shards.flatMap((shard) => shard.invalid ?? []));
  const results = shards.flatMap((shard) => shard.results);

  return {
    ...shards[0],
    generatedAt,
    startedAt,
    offset: 0,
    limit: totalInput,
    concurrency: Math.max(...shards.map((shard) => Number.isFinite(shard.concurrency) ? shard.concurrency : 0)),
    source,
    totalInput,
    duplicates,
    invalid,
    results,
    summary: {
      ...shards[0].summary,
      kpis: {
        overall: finalizeRateSummary(overallCounts),
        specialist: {
          ...specialistCounts,
          coverageTargetRate: rate(specialistCounts.meets99PercentCoverage, specialistCounts.targetEligible),
        },
        integrity: {
          ratingBelowCoverageTarget: uniqueSorted(ratingBelowCoverageTarget),
          noRatingAtOrAboveCoverageTargetWithScore: uniqueSorted(noRatingAtOrAboveCoverageTargetWithScore),
        },
        byMarket: mergeRateSummaryMaps(shards, "byMarket"),
        bySecurityType: mergeRateSummaryMaps(shards, "bySecurityType"),
      },
    },
  };
}
