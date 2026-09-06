import "server-only";

import { createHash, randomBytes } from "node:crypto";

const PRIVATE_LEAGUE_INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PRIVATE_LEAGUE_INVITE_HASH_PATTERN = /^[0-9a-f]{64}$/;

export function generatePrivateLeagueInviteTokenV3(): string {
  const token = randomBytes(32).toString("base64url");
  if (!PRIVATE_LEAGUE_INVITE_TOKEN_PATTERN.test(token)) {
    throw new Error("PRIVATE_LEAGUE_INVITE_GENERATION_FAILED");
  }
  return token;
}

export function hashPrivateLeagueInviteTokenV3(token: string): string | null {
  if (!PRIVATE_LEAGUE_INVITE_TOKEN_PATTERN.test(token)) return null;
  const hash = createHash("sha256").update(token, "utf8").digest("hex");
  return PRIVATE_LEAGUE_INVITE_HASH_PATTERN.test(hash) ? hash : null;
}
