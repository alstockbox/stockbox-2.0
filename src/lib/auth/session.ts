import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { getServerEnv } from "@/lib/env/server";
import { SESSION_COOKIE } from "./constants";

const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7;

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(email: string) {
  const secret = getServerEnv().SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET saknas.");
  const payload = Buffer.from(
    JSON.stringify({ email: email.toLowerCase(), nonce: randomUUID(), exp: Date.now() + ONE_WEEK_SECONDS * 1000 })
  ).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token?: string) {
  const secret = getServerEnv().SESSION_SECRET;
  if (!secret || !token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    email: string;
    exp: number;
  };
  if (!parsed.email || parsed.exp < Date.now()) return null;
  return parsed;
}

export async function setSession(email: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ONE_WEEK_SECONDS,
    path: "/"
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSession() {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function requireOwner() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
