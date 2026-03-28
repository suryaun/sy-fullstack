"use client";

import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

export default function UserAuthChip() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  if (status === "loading") {
    return (
      <span className="text-xs uppercase tracking-[0.2em] text-[#6b625b]">
        Checking session...
      </span>
    );
  }

  if (!session?.user) {
    return (
      <a
        href={`/login?callbackUrl=${encodeURIComponent(pathname || "/")}`}
        className="rounded-full border border-[#d7c9b7] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink transition hover:border-wine hover:text-wine"
      >
        Sign In
      </a>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs uppercase tracking-[0.18em] text-[#6b625b]">
        {session.user.name ?? "Signed In"}
      </span>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/" })}
        className="rounded-full bg-wine px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-ivory"
      >
        Sign Out
      </button>
    </div>
  );
}
