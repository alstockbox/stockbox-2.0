"use client";

import { Languages } from "lucide-react";
import { setLanguage } from "@/lib/i18n/actions";
import type { Locale } from "@/lib/i18n/types";

export function LanguageSwitcher({ locale }: { locale: Locale }) {
  return (
    <form action={setLanguage} className="flex items-center gap-2">
      <Languages className="h-4 w-4 text-[#9aa7b8]" aria-hidden="true" />
      <select
        name="locale"
        defaultValue={locale}
        className="h-9 rounded-md border border-white/10 bg-[#07111f] px-2 text-sm text-[#f4efe5]"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        aria-label="Language"
      >
        <option value="en">EN</option>
        <option value="sv">SV</option>
      </select>
    </form>
  );
}
