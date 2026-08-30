const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 1_000;
const MAX_RATE_LIMIT_COOLDOWN_MS = 10_000;

let requestTail: Promise<void> = Promise.resolve();
let cooldownUntil = 0;
let consecutiveRateLimits = 0;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryAfterMilliseconds(response: Response): number | null {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return null;
  return Math.max(0, date - Date.now());
}

export async function coordinatedYahooFetch(
  input: URL | RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  let release!: () => void;
  const previous = requestTail;
  requestTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    const waitMs = Math.max(0, cooldownUntil - Date.now());
    if (waitMs > 0) await delay(waitMs);

    const response = await fetch(input, init);
    if (response.status === 429) {
      consecutiveRateLimits += 1;
      const fallback = Math.min(
        MAX_RATE_LIMIT_COOLDOWN_MS,
        DEFAULT_RATE_LIMIT_COOLDOWN_MS * 2 ** (consecutiveRateLimits - 1),
      );
      const cooldown = retryAfterMilliseconds(response) ?? fallback;
      cooldownUntil = Math.max(cooldownUntil, Date.now() + cooldown);
    } else if (response.ok) {
      consecutiveRateLimits = 0;
      cooldownUntil = 0;
    }
    return response;
  } finally {
    release();
  }
}

export function resetYahooRequestCoordinatorForTests(): void {
  requestTail = Promise.resolve();
  cooldownUntil = 0;
  consecutiveRateLimits = 0;
}
