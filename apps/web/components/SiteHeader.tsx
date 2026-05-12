"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import UserAuthChip from "@/components/UserAuthChip";
import { useStore } from "@/components/StoreProvider";

export default function SiteHeader() {
  const pathname = usePathname();
  const { wishlistCount, cartCount } = useStore();

  const isActive = (href: string) => pathname === href;

  return (
    <header className="sticky top-0 z-20 border-b border-[#e4d9d0] bg-[#faf8f5]/97 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-3">
          <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-1 ring-[#e4d9d0]">
            <Image
              src="/seere-yaana-logo.png"
              alt="Seere Yaana"
              fill
              className="object-cover"
              sizes="40px"
              priority
            />
          </span>
          <span className="font-serif text-2xl italic tracking-wide text-ink sm:text-3xl">
            Seere Yaana
          </span>
        </Link>

        <nav className="flex items-center gap-5 text-[11px] uppercase tracking-[0.18em] text-[#5c4a42]">
          <Link
            href="/wishlist"
            className={`transition-colors ${isActive("/wishlist") ? "text-ink" : "hover:text-ink"}`}
          >
            Wishlist {wishlistCount > 0 ? `(${wishlistCount})` : ""}
          </Link>
          <Link
            href="/bag"
            className={`transition-colors ${isActive("/bag") ? "text-ink" : "hover:text-ink"}`}
          >
            Bag {cartCount > 0 ? `(${cartCount})` : ""}
          </Link>
          <Link
            href="/checkout"
            className={`transition-colors ${isActive("/checkout") ? "text-ink" : "hover:text-ink"}`}
          >
            Checkout
          </Link>
        </nav>

        <UserAuthChip />
      </div>
    </header>
  );
}
