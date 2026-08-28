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
    .replace(PROVIDER_KEY, "[redacted]");
}