"use client";

import Image from "next/image";
import Link from "next/link";
import type { CatalogProduct } from "@/lib/types";
import { useStore } from "@/components/StoreProvider";

type Props = {
  products: CatalogProduct[];
};

export default function BoutiqueGallery({ products }: Props) {
  const { addToCart, toggleWishlist, isWishlisted } = useStore();

  return (
    <section className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 pb-16 pt-8 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product, index) => {
        // Use a safe fallback image to avoid broken or oversized rendering from bad URLs.
        const primaryImage =
          product.images.find(
            (image) => typeof image === "string" && image.trim().length > 0,
          ) ??
          "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=1200&q=80";

        return (
          <article
            key={product.id}
            className="animate-rise overflow-hidden rounded-3xl border border-[#e8ddcf] bg-ivory shadow-luxe"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="h-80 w-full overflow-hidden">
              <Image
                src={primaryImage}
                alt={product.name}
                width={1200}
                height={1600}
                className="h-full w-full object-cover"
                sizes="(max-width: 768px) 100vw, 33vw"
                unoptimized
                priority={index < 2}
              />
            </div>
            <div className="space-y-3 p-5">
              <h3 className="font-serif text-3xl leading-none text-ink">
                {product.name}
              </h3>
              <p className="text-sm text-[#5b5149]">{product.description}</p>
              <p className="text-xs uppercase tracking-[0.2em] text-[#6b625b]">
                {product.fabric} | {product.craft} | Blouse{" "}
                {product.blouseIncluded ? "Included" : "Optional"}
              </p>
              <p className="text-lg font-semibold text-ink">
                Rs {(product.priceInPaise / 100).toLocaleString("en-IN")}
              </p>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/products/${product.id}`}
                  className="rounded-full bg-wine px-5 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-ivory"
                >
                  View Details
                </Link>

                <button
                  type="button"
                  onClick={() => toggleWishlist(product.id)}
                  className="rounded-full border border-[#d7c9b7] px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-[#5b5149]"
                >
                  {isWishlisted(product.id) ? "Wishlisted" : "Wishlist"}
                </button>

                <button
                  type="button"
                  disabled={product.stockStatus !== "IN_STOCK"}
                  onClick={() => addToCart(product.id, 1)}
                  className="rounded-full border border-[#d7c9b7] px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-[#5b5149] disabled:opacity-50"
                >
                  Add to Bag
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
