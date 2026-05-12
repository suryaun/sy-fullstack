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
    denied.cookies.set("admin_token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/admin",
      maxAge: 0
    });
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
    { expiresIn: "12h" }
  );

  const response = NextResponse.json({ ok: true });
  response.cookies.set("admin_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/admin",
    maxAge: 60 * 60 * 12
  });

  return response;
}
