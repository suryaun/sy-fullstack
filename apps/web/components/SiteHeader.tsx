"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import UserAuthChip from "@/components/UserAuthChip";
import { useStore } from "@/components/StoreProvider";

export default function SiteHeader() {
  const pathname = usePathname();
  const { wishlistCount, cartCount } = useStore();

  const isActive = (href: string) => pathname === href;

  return (
    <header className="sticky top-0 z-20 border-b border-[#eadfce] bg-[#f8f5f1]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="font-serif text-3xl text-ink">
          Seere Yaana
        </Link>

        <nav className="flex items-center gap-4 text-xs uppercase tracking-[0.2em] text-[#6b625b]">
          <Link
            href="/wishlist"
            className={isActive("/wishlist") ? "text-wine" : "hover:text-wine"}
          >
            Wishlist ({wishlistCount})
          </Link>
          <Link
            href="/bag"
            className={isActive("/bag") ? "text-wine" : "hover:text-wine"}
          >
            Bag ({cartCount})
          </Link>
          <Link
            href="/checkout"
            className={isActive("/checkout") ? "text-wine" : "hover:text-wine"}
          >
            Checkout
          </Link>
        </nav>

        <UserAuthChip />
      </div>
    </header>
  );
}
