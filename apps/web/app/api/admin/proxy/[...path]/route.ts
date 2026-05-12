import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminMobile } from "@/lib/adminAuth";

const ADMIN_API_BASE_URL = (
  process.env.ADMIN_API_INTERNAL_URL ??
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000"
).replace(/\/$/, "");

const PROXY_PREFIX = "/api/admin/proxy/";

export const dynamic = "force-dynamic";

function isUnsafeMethod(method: string) {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

function isSameOriginRequest(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }

  const host = request.headers.get("host");
  if (!host) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    return originUrl.host === host;
  } catch {
    return false;
  }
}

function getTargetUrl(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith(PROXY_PREFIX)) {
    return null;
  }

  const adminPath = pathname.slice(PROXY_PREFIX.length);
  if (!adminPath) {
    return null;
  }

  const target = new URL(`${ADMIN_API_BASE_URL}/api/admin/${adminPath}`);
  target.search = request.nextUrl.search;
  return target;
}

async function ensureAdminAccess(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.mobile) {
    return NextResponse.json({ message: "Admin login required" }, { status: 401 });
  }

  if (!isAdminMobile(session.user.mobile)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  if (isUnsafeMethod(request.method) && !isSameOriginRequest(request)) {
    return NextResponse.json({ message: "Invalid request origin" }, { status: 403 });
  }

  const token = request.cookies.get("admin_token")?.value;
  if (!token) {
    return NextResponse.json({ message: "Missing admin session" }, { status: 401 });
  }

  return token;
}

async function proxyRequest(request: NextRequest) {
  const access = await ensureAdminAccess(request);
  if (access instanceof NextResponse) {
    return access;
  }

  const target = getTargetUrl(request);
  if (!target) {
    return NextResponse.json({ message: "Invalid admin route" }, { status: 400 });
  }

  const upstreamHeaders = new Headers();
  upstreamHeaders.set("authorization", `Bearer ${access}`);

  const proxySecret = process.env.ADMIN_PROXY_SHARED_SECRET;
  if (proxySecret) {
    upstreamHeaders.set("x-admin-proxy-secret", proxySecret);
  }

  const contentType = request.headers.get("content-type");
  if (contentType) {
    upstreamHeaders.set("content-type", contentType);
  }

  const accept = request.headers.get("accept");
  if (accept) {
    upstreamHeaders.set("accept", accept);
  }

  try {
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : Buffer.from(await request.arrayBuffer());

    const upstream = await fetch(target.toString(), {
      method: request.method,
      headers: upstreamHeaders,
      body,
      cache: "no-store"
    });

    const responseHeaders = new Headers();
    const responseContentType = upstream.headers.get("content-type");
    if (responseContentType) {
      responseHeaders.set("content-type", responseContentType);
    }

    const cacheControl = upstream.headers.get("cache-control");
    if (cacheControl) {
      responseHeaders.set("cache-control", cacheControl);
    }

    return new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: responseHeaders
    });
  } catch {
    return NextResponse.json({ message: "Admin upstream unavailable" }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  return proxyRequest(request);
}

export async function POST(request: NextRequest) {
  return proxyRequest(request);
}

export async function PUT(request: NextRequest) {
  return proxyRequest(request);
}

export async function PATCH(request: NextRequest) {
  return proxyRequest(request);
}

export async function DELETE(request: NextRequest) {
  return proxyRequest(request);
}
