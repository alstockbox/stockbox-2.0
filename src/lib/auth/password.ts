import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

const ITERATIONS = 310000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("base64url");
  return `pbkdf2$${ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password: string, encodedHash: string) {
  const [scheme, iterationText, salt, expectedHash] = encodedHash.split("$");
  if (scheme !== "pbkdf2" || !iterationText || !salt || !expectedHash) return false;
  const iterations = Number(iterationText);
  if (!Number.isInteger(iterations) || iterations < 100000) return false;

  const candidate = pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST);
  const expected = Buffer.from(expectedHash, "base64url");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
