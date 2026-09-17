import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

export async function proxy(request: NextRequest) {
  const session = await auth();
  const path = request.nextUrl.pathname;
  if (!session && path !== "/login" && !path.startsWith("/login/")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (session && (path === "/login" || path.startsWith("/login/"))) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon|apple-icon|install-push.sh|.*\\.png|.*\\.ico).*)",
  ],
};
