"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

export default function UserAuthChip() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const displayName = session?.user?.name?.trim() || "Signed In";
  const initials = useMemo(() => {
    const parts = displayName.split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return "U";
    }
    if (parts.length === 1) {
      return parts[0].slice(0, 1).toUpperCase();
    }
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }, [displayName]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!menuRef.current) {
        return;
      }

      const target = event.target as Node;
      if (!menuRef.current.contains(target)) {
        setIsMenuOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isMenuOpen]);

  if (status === "loading") {
    return (
      <span className="text-xs uppercase tracking-[0.2em] text-[#4e4038]">
        Checking session...
      </span>
    );
  }

  if (!session?.user) {
    return (
      <a
        href={`/login?callbackUrl=${encodeURIComponent(pathname || "/")}`}
        className="rounded-sm border border-[#e4d9d0] px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-ink transition hover:border-[#c5b9ae] hover:bg-[#f5f1eb]"
      >
        Sign In
      </a>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsMenuOpen((previous) => !previous)}
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        className="flex h-8 w-8 items-center justify-center rounded border border-[#e4d9d0] bg-[#faf8f5] text-[11px] uppercase tracking-[0.08em] text-[#5c4e44] transition hover:border-[#c5b9ae] hover:bg-white"
      >
        {initials}
      </button>

      {isMenuOpen ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-52 rounded border border-[#e4d9d0] bg-white p-4 shadow-[0_8px_32px_rgba(31,26,23,0.09)]">
          <p className="truncate text-sm font-semibold text-[#3f3731]">
            {displayName}
          </p>
          <p className="mt-1 truncate text-xs text-[#5c4a42]">
            {session.user.email ?? "Signed in"}
          </p>
          <Link
            href="/orders"
            onClick={() => setIsMenuOpen(false)}
            className="mt-3 block w-full rounded-sm border border-[#e4d9d0] px-3 py-2 text-center text-xs uppercase tracking-[0.16em] text-[#5c4e44] transition hover:border-[#c5b9ae] hover:bg-[#faf8f5]"
          >
            Orders
          </Link>
          <Link
            href="/account"
            onClick={() => setIsMenuOpen(false)}
            className="mt-1.5 block w-full rounded-sm border border-[#e4d9d0] px-3 py-2 text-center text-xs uppercase tracking-[0.16em] text-[#5c4e44] transition hover:border-[#c5b9ae] hover:bg-[#faf8f5]"
          >
            My Account
          </Link>
          <button
            type="button"
            onClick={async () => {
              setIsMenuOpen(false);
              await signOut({ redirect: false });
              window.location.assign("/");
            }}
            className="mt-1.5 w-full rounded-sm bg-ink px-3 py-2 text-xs uppercase tracking-[0.16em] text-[#faf8f5] transition hover:bg-wine"
          >
            Sign Out
          </button>
        </div>
      ) : null}
    </div>
  );
}
