import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const REFERRAL_COOKIE = "stockbox_ref";
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

function hasExistingReferral(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie.split(";").some((part) => part.trim().startsWith(`${REFERRAL_COOKIE}=`));
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const target = new URL("/auth/signup", request.url);
  const response = NextResponse.redirect(target, 307);
  const admin = createAdminClient();

  if (!admin) return response;

  try {
    const { data, error } = await admin.rpc("record_affiliate_click", { p_code: code });
    const recorded = !error && Boolean((data as { recorded?: boolean } | null)?.recorded);
    if (!recorded || hasExistingReferral(request)) return response;

    response.cookies.set({
      name: REFERRAL_COOKIE,
      value: code,
      httpOnly: true,
      sameSite: "lax",
      secure: target.protocol === "https:",
      maxAge: THIRTY_DAYS_SECONDS,
      path: "/",
    });
  } catch {
    return response;
  }

  return response;
}
