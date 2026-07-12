"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/components/StoreProvider";
import { getPublicApiUrl } from "@/lib/publicApiUrl";
import type { CatalogProduct } from "@/lib/types";

type ApiWishlistProduct = {
  id: string;
  name: string;
  description: string;
  fabric: string;
  categoryLabel: string | null;
  lengthInMeters: number;
  blouseIncluded: boolean;
  priceInPaise: number;
  stockStatus: "IN_STOCK" | "SOLD_OUT";
  imageUrl: string;
  images?: Array<{ imageUrl: string; sortOrder?: number }>;
  colors?: Array<{
    id: string;
    name: string;
    colorCode?: string | null;
    isDefault: boolean;
    stockQuantity: number;
    priceInPaise?: number | null;
    images?: Array<{ imageUrl: string; sortOrder?: number }>;
  }>;
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
    categoryLabel: product.categoryLabel,
    lengthInMeters: product.lengthInMeters,
    weight: "-",
    work: "Curated handcrafted detailing",
    colorTone: "Curated shade",
    care: "Dry clean only",
    occasion: "Festive and occasion wear",
    blouseIncluded: product.blouseIncluded,
    priceInPaise: product.priceInPaise,
    stockStatus: product.stockStatus,
    availableColors: product.colors?.map((color) => ({
      id: color.id,
      name: color.name,
      colorCode: color.colorCode,
      isDefault: color.isDefault,
      stockQuantity: color.stockQuantity,
      priceInPaise: color.priceInPaise,
      images: (color.images ?? []).map((image) => image.imageUrl),
    })),
  };
}

export default function WishlistPage() {
  const { wishlistIds, toggleWishlist, addToCart, cartItems, cartCount } =
    useStore();
  const [allProducts, setAllProducts] = useState<CatalogProduct[]>([]);

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

        setAllProducts(mappedApi);
      } catch {
        setAllProducts([]);
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
            selectedColor:
              (entry.colorId
                ? product.availableColors?.find(
                    (color) => color.id === entry.colorId,
                  )
                : undefined) ??
              product.availableColors?.find((color) => color.isDefault) ??
              product.availableColors?.[0],
          };
        })
        .filter(
          (
            item,
          ): item is {
            entry: (typeof wishlistEntries)[number];
            product: CatalogProduct;
            selectedColor:
              | NonNullable<CatalogProduct["availableColors"]>[number]
              | undefined;
          } => item !== null,
        ),
    [allProducts, wishlistEntries],
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="font-serif text-3xl text-ink">Wishlist</h1>
      <p className="mt-2 text-sm text-[#4e4038]">
        Save your favorite drapes and revisit them anytime.
      </p>

      {cartCount > 0 ? (
        <div className="mt-4 flex justify-end">
          <Link
            href="/checkout"
            className="rounded-sm bg-ink px-6 py-2.5 text-[11px] uppercase tracking-[0.18em] text-[#faf8f5]"
          >
            Checkout ({cartCount})
          </Link>
        </div>
      ) : null}

      {products.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[#d8cab8] bg-[#f8f2ea] p-8 text-center text-[#4e4038]">
          Your wishlist is empty.{" "}
          <Link href="/" className="font-semibold text-wine">
            Browse collection
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map(({ entry, product, selectedColor }) => {
            const effectivePrice = selectedColor?.priceInPaise ?? product.priceInPaise;
            const resolvedColorId = selectedColor?.id;
            const isVariantAvailable =
              product.stockStatus === "IN_STOCK" &&
              (selectedColor?.stockQuantity ?? 0) > 0;
            const bagQuantity = resolvedColorId
              ? (cartItems.find(
                  (item) =>
                    item.productId === product.id && item.colorId === resolvedColorId,
                )?.quantity ?? 0)
              : 0;

            return (
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
                  <p className="text-xs uppercase tracking-[0.12em] text-[#5c4a42]">
                    Color: {selectedColor?.name ?? "Unavailable"}
                  </p>
                  <p className="text-sm text-[#4e4038]">
                    Rs {(effectivePrice / 100).toLocaleString("en-IN")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/products/${product.id}`}
                      className="rounded-sm bg-ink px-5 py-2.5 text-[11px] uppercase tracking-[0.18em] text-[#faf8f5]"
                    >
                      View
                    </Link>
                    {bagQuantity > 0 ? (
                      <div className="flex items-center gap-2 rounded-sm border border-[#e4d9d0] bg-[#f5f1eb] px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-ink">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          aria-hidden="true"
                        >
                          <path d="M6.5 9h11l-1.1 9a2 2 0 0 1-2 1.8H9.6a2 2 0 0 1-2-1.8L6.5 9Z" />
                          <path d="M9 9V7a3 3 0 1 1 6 0v2" />
                        </svg>
                        <span>Bag {bagQuantity}</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (!resolvedColorId) {
                              return;
                            }

                            addToCart(product.id, resolvedColorId, -1);
                          }}
                          className="rounded-sm border border-[#e4d9d0] bg-white px-2 py-0.5 text-xs"
                          aria-label="Decrease bag quantity"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!resolvedColorId || !isVariantAvailable) {
                              return;
                            }

                            addToCart(product.id, resolvedColorId, 1);
                          }}
                          disabled={
                            !resolvedColorId ||
                            !isVariantAvailable ||
                            bagQuantity >= (selectedColor?.stockQuantity ?? 0)
                          }
                          className="rounded-sm border border-[#e4d9d0] bg-white px-2 py-0.5 text-xs disabled:opacity-50"
                          aria-label="Increase bag quantity"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (!resolvedColorId || !isVariantAvailable) {
                            return;
                          }

                          addToCart(product.id, resolvedColorId, 1);
                        }}
                        disabled={!resolvedColorId || !isVariantAvailable}
                        className="rounded-full border border-[#d7c9b7] px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-[#5b5149]"
                      >
                        Add to Bag
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleWishlist(product.id, entry.colorId)}
                      className="rounded-full border border-[#d8b9bf] bg-[#fff1f4] px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-[#7a2b3b]"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
