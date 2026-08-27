const DEFAULT_SAFE_PATH = "/dashboard";
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

function repeatedlyDecode(value: string): string | null {
  let current = value;
  try {
    for (let pass = 0; pass < 3; pass += 1) {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    }
    return current;
  } catch {
    return null;
  }
}

function normalizeInternalPath(value: string): string | null {
  if (!value || value.trim() !== value || CONTROL_CHARACTERS.test(value)) return null;
  const decoded = repeatedlyDecode(value);
  if (!decoded || CONTROL_CHARACTERS.test(decoded) || decoded.includes("\\")) return null;
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return null;

  const base = new URL("https://stockbox.invalid");
  const resolved = new URL(decoded, base);
  if (resolved.origin !== base.origin || !resolved.pathname.startsWith("/")) return null;
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
export function safeInternalPath(
  value: string | null | undefined,
  fallback = DEFAULT_SAFE_PATH,
): string {
  const safeFallback = normalizeInternalPath(fallback) ?? DEFAULT_SAFE_PATH;
  if (typeof value !== "string") return safeFallback;
  return normalizeInternalPath(value) ?? safeFallback;
}
