import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/app") && !hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if ((pathname === "/" || pathname === "/login") && hasSession) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|opengraph-image|robots.txt|sitemap.xml).*)"
  ]
};
