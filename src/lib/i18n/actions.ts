"use server";

import { cookies } from "next/headers";
import { normalizeLocale } from "./server";

export async function setLanguage(formData: FormData) {
  const cookieStore = await cookies();
  cookieStore.set("stockbox_locale", normalizeLocale(String(formData.get("locale") ?? "en")), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365
  });
}
