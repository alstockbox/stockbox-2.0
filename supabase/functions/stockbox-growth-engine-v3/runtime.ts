export type ConfigRow = {
  key: string;
  value: unknown;
  value_type?: string | null;
};

export function parseConfigRows(rows: ConfigRow[]) {
  const cfg: Record<string, unknown> = {};
  for (const row of rows || []) {
    let value: unknown = row.value;
    if (value !== null && value !== undefined) {
      if (row.value_type === "number") {
        const parsed = Number(value);
        value = Number.isFinite(parsed) ? parsed : null;
      } else if (row.value_type === "boolean") {
        value = ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
      } else if (row.value_type === "json") {
        try { value = JSON.parse(String(value)); } catch { /* preserve raw value */ }
      } else if (row.value_type === "csv") {
        value = String(value).split(",").map((part) => part.trim()).filter(Boolean);
      }
    }
    cfg[row.key] = value;
  }
  return cfg;
}

export function configBool(value: unknown, fallback = false) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
}

export const GROWTH_V3_CANARY_VERSION = "growth-v3-shadow-canary";
