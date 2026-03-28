import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAdminMobile } from "@/lib/adminAuth";

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/admin")) {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET
    });

    const mobile = typeof (token as { mobile?: string } | null)?.mobile === "string"
      ? (token as { mobile?: string }).mobile
      : undefined;

    if (!token || !mobile) {
      return NextResponse.redirect(new URL("/login?callbackUrl=/admin", request.url));
    }

    if (!isAdminMobile(mobile)) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"]
};
