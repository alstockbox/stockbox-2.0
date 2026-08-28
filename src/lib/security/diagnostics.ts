export type PublicDiagnosticCode =
  | "provider_unavailable"
  | "analysis_exception"
  | "persistence_failed"
  | "persistence_exception";

const PUBLIC_CODES = new Set<PublicDiagnosticCode>([
  "provider_unavailable",
  "analysis_exception",
  "persistence_failed",
  "persistence_exception",
]);

const SECRET_ASSIGNMENT = /\b(token|api[_-]?key|authorization|password|secret|client[_-]?secret)\s*[:=]\s*[^\s,;]+/gi;
const BEARER_TOKEN = /\bBearer\s+[^\s,;]+/gi;
const PROVIDER_KEY = /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_-]+/gi;
const WEBHOOK_SECRET = /\bwhsec_[A-Za-z0-9_-]+/gi;
const SUPABASE_KEY = /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const SECRET_KEY_NAME = /token|api[_-]?key|authorization|password|secret|client[_-]?secret/i;

export function publicDiagnosticCode(error: unknown, fallback: PublicDiagnosticCode): PublicDiagnosticCode {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && PUBLIC_CODES.has(code as PublicDiagnosticCode)) return code as PublicDiagnosticCode;
  }
  return fallback;
}
export function sanitizeDiagnosticMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : fallback;
  const bounded = raw.trim().slice(0, 400) || fallback;
  return bounded
    .replace(SECRET_ASSIGNMENT, (_match, key: string) => `${key}=[redacted]`)
    .replace(BEARER_TOKEN, "Bearer [redacted]")
    .replace(PROVIDER_KEY, "[redacted]")
    .replace(WEBHOOK_SECRET, "[redacted]")
    .replace(SUPABASE_KEY, "[redacted]")
    .replace(JWT, "[redacted]");
}

export function sanitizeDiagnosticContext(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[truncated]";
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return sanitizeDiagnosticMessage(value, "[redacted]");
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeDiagnosticContext(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 30).map(([key, child]) => [
      key,
      SECRET_KEY_NAME.test(key) ? "[redacted]" : sanitizeDiagnosticContext(child, depth + 1),
    ]));
  }
  return String(value).slice(0, 200);
}