import "server-only";

export function isCronAuthorized(
  authorization: string | null,
  secret: string | null | undefined,
): boolean {
  return Boolean(secret) && authorization === `Bearer ${secret}`;
}
