"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/components/StoreProvider";
import { catalogProducts } from "@/lib/catalog";

export default function WishlistPage() {
  const { wishlistIds, toggleWishlist, addToCart } = useStore();

  const products = useMemo(
    () => catalogProducts.filter((product) => wishlistIds.includes(product.id)),
    [wishlistIds],
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="font-serif text-3xl text-ink">Wishlist</h1>
      <p className="mt-2 text-sm text-[#6b625b]">
        Save your favorite drapes and revisit them anytime.
      </p>

      {products.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[#d8cab8] bg-[#f8f2ea] p-8 text-center text-[#6b625b]">
          Your wishlist is empty.{" "}
          <Link href="/" className="font-semibold text-wine">
            Browse collection
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <article
              key={product.id}
              className="overflow-hidden rounded-2xl border border-[#e4d8ca] bg-[#fbf8f2]"
            >
              <div className="relative h-72">
                <Image
                  src={product.images[0]}
                  alt={product.name}
                  fill
                  className="object-cover"
                />
              </div>
              <div className="space-y-2 p-4">
                <h2 className="font-serif text-xl text-ink">{product.name}</h2>
                <p className="text-sm text-[#6b625b]">
                  Rs {(product.priceInPaise / 100).toLocaleString("en-IN")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/products/${product.id}`}
                    className="rounded-full bg-wine px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-ivory"
                  >
                    View
                  </Link>
                  <button
                    type="button"
                    onClick={() => addToCart(product.id, 1)}
                    className="rounded-full border border-[#d7c9b7] px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-[#5b5149]"
                  >
                    Add to Bag
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleWishlist(product.id)}
                    className="rounded-full border border-[#d7c9b7] px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-[#5b5149]"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
