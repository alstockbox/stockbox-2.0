import { cookies, headers } from "next/headers";
import { dictionaries } from "./dictionaries";
import type { Locale } from "./types";

export const supportedLocales: Locale[] = ["en", "sv"];

export function normalizeLocale(value: string | null | undefined): Locale {
  if (!value) return "en";
  const lower = value.toLowerCase();
  if (lower.startsWith("sv")) return "sv";
  return "en";
}

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const stored = cookieStore.get("stockbox_locale")?.value;
  if (stored) return normalizeLocale(stored);

  const headerStore = await headers();
  return normalizeLocale(headerStore.get("accept-language"));
}

export async function getDictionary() {
  const locale = await getLocale();
  return dictionaries[locale];
}
