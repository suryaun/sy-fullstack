import { NextResponse } from "next/server";
import { auth } from "@/auth";

const INTERNAL_API_URL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000";

export const dynamic = "force-dynamic";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const response = await fetch(
    `${INTERNAL_API_URL}/api/auth/mobile/addresses/${encodeURIComponent(id)}/default`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId })
    }
  );

  const payload = await response.json().catch(() => ({}));
  return NextResponse.json(payload, { status: response.status });
}
