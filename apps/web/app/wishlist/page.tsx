"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/components/StoreProvider";
import { catalogProducts } from "@/lib/catalog";
import { getPublicApiUrl } from "@/lib/publicApiUrl";
import type { CatalogProduct } from "@/lib/types";

type ApiWishlistProduct = {
  id: string;
  name: string;
  description: string;
  fabric: string;
  craft: string;
  lengthInMeters: number;
  blouseIncluded: boolean;
  priceInPaise: number;
  stockStatus: "IN_STOCK" | "SOLD_OUT";
  imageUrl: string;
  images?: Array<{ imageUrl: string; sortOrder?: number }>;
};

function mapApiProductToCatalog(product: ApiWishlistProduct): CatalogProduct {
  const imageUrls =
    product.images && product.images.length > 0
      ? product.images
          .slice()
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          .map((image) => image.imageUrl)
      : [product.imageUrl];

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    longDescription: product.description,
    images: imageUrls,
    fabric: product.fabric,
    craft: product.craft,
    lengthInMeters: product.lengthInMeters,
    weight: "-",
    work: "Curated handcrafted detailing",
    colorTone: "Curated shade",
    care: "Dry clean only",
    occasion: "Festive and occasion wear",
    blouseIncluded: product.blouseIncluded,
    priceInPaise: product.priceInPaise,
    stockStatus: product.stockStatus,
  };
}

export default function WishlistPage() {
  const { wishlistIds, toggleWishlist, addToCart } = useStore();
  const [allProducts, setAllProducts] =
    useState<CatalogProduct[]>(catalogProducts);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const apiUrl = getPublicApiUrl();
        const response = await fetch(`${apiUrl}/api/products`, {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const apiProducts = (await response.json()) as ApiWishlistProduct[];
        const mappedApi = apiProducts.map(mapApiProductToCatalog);

        const mergedById = new Map<string, CatalogProduct>();
        for (const product of catalogProducts) {
          mergedById.set(product.id, product);
        }
        for (const product of mappedApi) {
          mergedById.set(product.id, product);
        }

        setAllProducts(Array.from(mergedById.values()));
      } catch {
        // Keep static fallback when API is unavailable.
      }
    };

    void loadProducts();
  }, []);

  const wishlistEntries = useMemo(
    () =>
      wishlistIds.map((wishlistKey) => {
        const [productId, colorToken] = wishlistKey.split("::");
        return {
          wishlistKey,
          productId,
          colorId:
            colorToken && colorToken !== "default" ? colorToken : undefined,
        };
      }),
    [wishlistIds],
  );

  const products = useMemo(
    () =>
      wishlistEntries
        .map((entry) => {
          const product = allProducts.find(
            (item) => item.id === entry.productId,
          );
          if (!product) {
            return null;
          }

          return {
            entry,
            product,
          };
        })
        .filter(
          (
            item,
          ): item is {
            entry: (typeof wishlistEntries)[number];
            product: CatalogProduct;
          } => item !== null,
        ),
    [allProducts, wishlistEntries],
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
          {products.map(({ entry, product }) => (
            <article
              key={entry.wishlistKey}
              className="overflow-hidden rounded-2xl border border-[#e4d8ca] bg-[#fbf8f2]"
            >
              <div className="relative h-72">
                <Image
                  src={product.images[0]}
                  alt={product.name}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="space-y-2 p-4">
                <h2 className="font-serif text-xl text-ink">{product.name}</h2>
                <p className="text-xs uppercase tracking-[0.12em] text-[#7a6c5f]">
                  {entry.colorId ? "Selected color variant" : "Default variant"}
                </p>
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
                    onClick={() => toggleWishlist(product.id, entry.colorId)}
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
