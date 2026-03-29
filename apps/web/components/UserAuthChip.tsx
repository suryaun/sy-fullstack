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
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsMenuOpen((previous) => !previous)}
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d7c9b7] bg-white text-xs font-semibold uppercase tracking-[0.08em] text-[#5e554d] transition hover:border-wine hover:text-wine"
      >
        {initials}
      </button>

      {isMenuOpen ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-xl border border-[#e2d6c8] bg-[#fffdf9] p-3 shadow-lg">
          <p className="truncate text-sm font-semibold text-[#3f3731]">
            {displayName}
          </p>
          <p className="mt-1 truncate text-xs text-[#7b726a]">
            {session.user.email ?? "Signed in"}
          </p>
          <Link
            href="/complete-profile"
            onClick={() => setIsMenuOpen(false)}
            className="mt-3 block w-full rounded-lg border border-[#d7c9b7] px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-[#5e554d] transition hover:border-wine hover:text-wine"
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
            className="mt-2 w-full rounded-lg bg-wine px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-ivory"
          >
            Sign Out
          </button>
        </div>
      ) : null}
    </div>
  );
}
