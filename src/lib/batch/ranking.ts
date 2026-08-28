export type BatchRankInput = {
  key: string;
  score: number | null;
  confidence: number | null;
  coverage: number | null;
};

function finiteOrZero(value: number | null): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function rankBatchResults(items: BatchRankInput[]): Record<string, number | null> {
  const ranks: Record<string, number | null> = Object.fromEntries(
    items.map((item) => [item.key, null]),
  );
  const scored = items
    .filter((item) => typeof item.score === "number" && Number.isFinite(item.score))
    .sort((left, right) =>
      finiteOrZero(right.score) - finiteOrZero(left.score)
      || finiteOrZero(right.confidence) - finiteOrZero(left.confidence)
      || finiteOrZero(right.coverage) - finiteOrZero(left.coverage)
      || left.key.localeCompare(right.key),
    );
  scored.forEach((item, index) => {
    ranks[item.key] = index + 1;
  });
  return ranks;
}