import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminMobile, normalizeMobile } from "@/lib/adminAuth";

export async function POST() {
  const session = await auth();

  if (!session?.user?.mobile) {
    return NextResponse.json({ message: "Please login with mobile OTP first" }, { status: 401 });
  }

  if (!isAdminMobile(session.user.mobile)) {
    const denied = NextResponse.json({ message: "Mobile number is not allowed for admin access" }, { status: 403 });
    denied.cookies.delete("admin_token");
    return denied;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return NextResponse.json({ message: "JWT_SECRET is missing" }, { status: 500 });
  }

  const token = jwt.sign(
    {
      adminId: session.user.id ?? normalizeMobile(session.user.mobile),
      role: "admin",
      mobile: normalizeMobile(session.user.mobile)
    },
    secret,
    { expiresIn: "7d" }
  );

  const response = NextResponse.json({ ok: true });
  response.cookies.set("admin_token", token, {
    httpOnly: false,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });

  return response;
}
