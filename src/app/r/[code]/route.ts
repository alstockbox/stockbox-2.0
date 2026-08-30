import { NextResponse } from "next/server";
import { normalizeReferralCode } from "@/lib/affiliate/attribution";
import { createAdminClient } from "@/lib/supabase/admin";

const REFERRAL_COOKIE = "stockbox_ref";
const VISITOR_COOKIE = "stockbox_ref_visitor";
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  const part = cookie.split(";").map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : null;
}

function referralCookieOptions(target: URL) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: target.protocol === "https:",
    maxAge: THIRTY_DAYS_SECONDS,
    path: "/",
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const target = new URL("/auth/signup", request.url);
  const response = NextResponse.redirect(target, 307);
  if (cookieValue(request, REFERRAL_COOKIE)) return response;

  const { code } = await context.params;
  const normalized = normalizeReferralCode(code);
  const admin = createAdminClient();
  if (!normalized || !admin) return response;

  try {
    const { data: affiliate, error } = await admin.from("affiliates")
      .select("id,code")
      .ilike("code", normalized)
      .eq("status", "active")
      .maybeSingle();
    if (error || !affiliate) return response;

    const visitorToken = cookieValue(request, VISITOR_COOKIE) ?? crypto.randomUUID();
    await admin.from("affiliate_clicks").upsert({
      affiliate_id: affiliate.id,
      code: affiliate.code,
      visitor_token: visitorToken,
      landing_path: new URL(request.url).pathname.slice(0, 500),
    }, { onConflict: "affiliate_id,visitor_token", ignoreDuplicates: true });

    const options = referralCookieOptions(target);
    response.cookies.set(REFERRAL_COOKIE, affiliate.code, options);
    if (!cookieValue(request, VISITOR_COOKIE)) {
      response.cookies.set(VISITOR_COOKIE, visitorToken, options);
    }
  } catch {
    return response;
  }

  return response;
}
