import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { normalizeReferralCode } from "@/lib/affiliate/attribution";
import { isSupabaseConfigured } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";

const REFERRAL_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function cookieOptions(request: NextRequest) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: REFERRAL_MAX_AGE_SECONDS,
  };
}

async function recordAffiliateClick(request: NextRequest, code: string, visitorToken: string) {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    const { data: affiliate } = await admin.from("affiliates")
      .select("id,code")
      .eq("code", code)
      .eq("status", "active")
      .maybeSingle();
    if (!affiliate) return;
    await admin.from("affiliate_clicks").upsert({
      affiliate_id: affiliate.id,
      code: affiliate.code,
      visitor_token: visitorToken,
      landing_path: `${request.nextUrl.pathname}${request.nextUrl.search}`.slice(0, 500),
    }, { onConflict: "affiliate_id,visitor_token", ignoreDuplicates: true });
  } catch (error) {
    console.warn("[affiliate] Click tracking failed without blocking navigation.", {
      error: error instanceof Error ? error.name : "unknown",
    });
  }
}

function captureAffiliateLanding(request: NextRequest, response: NextResponse, event?: NextFetchEvent) {
  const incomingCode = normalizeReferralCode(request.nextUrl.searchParams.get("ref"));
  if (!incomingCode) return;

  const existingCode = normalizeReferralCode(request.cookies.get("stockbox_ref")?.value);
  const visitorToken = request.cookies.get("stockbox_ref_visitor")?.value ?? crypto.randomUUID();
  const options = cookieOptions(request);

  if (!existingCode) response.cookies.set("stockbox_ref", incomingCode, options);
  if (!request.cookies.get("stockbox_ref_visitor")) {
    response.cookies.set("stockbox_ref_visitor", visitorToken, options);
  }

  const tracking = recordAffiliateClick(request, incomingCode, visitorToken);
  if (event) event.waitUntil(tracking);
  else void tracking;
}
export async function updateSession(request: NextRequest, event?: NextFetchEvent) {
  if (!isSupabaseConfigured()) {
    const response = NextResponse.next({ request });
    captureAffiliateLanding(request, response, event);
    return response;
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getClaims();
  captureAffiliateLanding(request, response, event);
  return response;
}
