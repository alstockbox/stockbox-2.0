import { NextResponse, type NextRequest } from "next/server";
import { safeInternalPath } from "@/lib/auth/redirects";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const tokenType = request.nextUrl.searchParams.get("type");
  const next = safeInternalPath(request.nextUrl.searchParams.get("next"));

  if (tokenHash && (tokenType === "email" || tokenType === "recovery")) {
    const supabase = await createClient();
    const { error } = (await supabase?.auth.verifyOtp({ token_hash: tokenHash, type: tokenType })) ?? { error: new Error("Auth is not configured.") };
    if (!error) return NextResponse.redirect(new URL(next, request.url));
    return NextResponse.redirect(new URL("/auth/login?error=callback", request.url));
  }

  if (code) {
    const supabase = await createClient();
    const { error } = (await supabase?.auth.exchangeCodeForSession(code)) ?? { error: new Error("Auth is not configured.") };
    if (!error) return NextResponse.redirect(new URL(next, request.url));

    // Supabase may already have verified the email before redirecting here.
    // If the link was opened on another device, the PKCE verifier cookie is absent,
    // so a session cannot be exchanged even though the account is confirmed.
    return NextResponse.redirect(new URL("/auth/login?confirmed=1", request.url));
  }

  return NextResponse.redirect(new URL("/auth/login?error=callback", request.url));
}
