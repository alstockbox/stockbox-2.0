export type BatchProgressRow = {
  input: string;
  status: string;
};

const TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
  "ambiguous",
  "not_found",
  "unsupported",
  "lookup_failed",
]);

export function getBatchProgressState(rows: BatchProgressRow[]) {
  const total = rows.length;
  const processedCount = rows.filter((row) => TERMINAL_STATUSES.has(row.status)).length;
  const activeInput = rows.find((row) => row.status === "running")?.input ?? null;

  return {
    processedCount,
    total,
    progress: total ? Math.round((processedCount / total) * 100) : 0,
    activeInput,
    isActive: activeInput !== null,
  };
}
