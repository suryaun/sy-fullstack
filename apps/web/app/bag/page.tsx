"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/components/StoreProvider";
import { getPublicApiUrl } from "@/lib/publicApiUrl";

type ApiBagProduct = {
  id: string;
  name: string;
  description: string;
  fabric: string;
  categoryLabel: string | null;
  lengthInMeters: number;
  blouseIncluded: boolean;
  priceInPaise: number;
  stockStatus: "IN_STOCK" | "SOLD_OUT";
  imageUrl: string | null;
  images?: Array<{ imageUrl: string; sortOrder?: number }>;
  colors: Array<{
    id: string;
    name: string;
    colorCode?: string | null;
    isDefault: boolean;
    stockQuantity: number;
    priceInPaise?: number | null;
    images?: Array<{ imageUrl: string; sortOrder?: number }>;
  }>;
};

export default function BagPage() {
  const {
    cartItems,
    addToCart,
    removeFromCart,
    toggleWishlist,
    isWishlisted,
    legacyCartEntries,
    clearLegacyCartEntries,
  } = useStore();
  const [allProducts, setAllProducts] = useState<ApiBagProduct[]>([]);

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

        const apiProducts = (await response.json()) as ApiBagProduct[];
        setAllProducts(apiProducts);
      } catch {
        setAllProducts([]);
      }
    };

    void loadProducts();
  }, []);

  const detailed = useMemo(
    () =>
      cartItems
        .flatMap((item) => {
          const product = allProducts.find((candidate) => candidate.id === item.productId);
          if (!product) {
            return [];
          }

          const selectedColor = product.colors.find(
            (color) => color.id === item.colorId,
          );
          if (!selectedColor) {
            return [];
          }

          const imageUrl =
            selectedColor.images?.[0]?.imageUrl ??
            product.images?.[0]?.imageUrl ??
            product.imageUrl ??
            "/seere-yaana-logo.png";
          const unitPrice = selectedColor.priceInPaise ?? product.priceInPaise;

          return [{
            ...item,
            product,
            selectedColor,
            unitPrice,
            imageUrl
          }];
        })
        .filter(
          (item) =>
            item.product.stockStatus === "IN_STOCK" &&
            item.selectedColor.stockQuantity >= item.quantity,
        ),
    [allProducts, cartItems],
  );

  const unavailableItems = useMemo(
    () =>
      cartItems.filter((item) => {
        const product = allProducts.find((candidate) => candidate.id === item.productId);
        if (!product) {
          return true;
        }

        const color = product.colors.find((candidate) => candidate.id === item.colorId);
        if (!color) {
          return true;
        }

        return (
          product.stockStatus !== "IN_STOCK" ||
          color.stockQuantity <= 0 ||
          item.quantity > color.stockQuantity
        );
      }),
    [allProducts, cartItems],
  );

  const removeAllUnavailableItems = () => {
    for (const item of unavailableItems) {
      removeFromCart(item.productId, item.colorId);
    }
  };

  const moveToWishlist = (productId: string, colorId: string) => {
    if (!isWishlisted(productId, colorId)) {
      toggleWishlist(productId, colorId);
    }

    removeFromCart(productId, colorId);
  };

  const total = detailed.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="font-serif text-3xl text-ink">Shopping Bag</h1>

      {legacyCartEntries.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-[#e4d8ca] bg-[#fff7ed] p-4 text-sm text-[#4e4038]">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-[#5b5149]">
              Some older bag entries were removed because they did not include a color variant.
            </p>
            <button
              type="button"
              onClick={clearLegacyCartEntries}
              className="shrink-0 rounded-sm border border-[#e4d9d0] px-3 py-1.5 text-[11px]"
            >
              Dismiss
            </button>
          </div>
          <ul className="mt-2 space-y-2">
            {legacyCartEntries.map((entry) => (
              <li key={`legacy-${entry.key}`} className="text-xs">
                Rejected item: {entry.productId ?? entry.key} | Qty {entry.quantity}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {unavailableItems.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-[#e4d8ca] bg-[#fff7ed] p-4 text-sm text-[#4e4038]">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-[#5b5149]">
              Some items are no longer available and need attention.
            </p>
            <button
              type="button"
              onClick={removeAllUnavailableItems}
              className="shrink-0 rounded-sm border border-[#e4d9d0] px-3 py-1.5 text-[11px]"
            >
              Remove all
            </button>
          </div>
          <ul className="mt-2 space-y-2">
            {unavailableItems.map((item) => (
              <li key={`missing-${item.key}`} className="flex items-center justify-between gap-2">
                <span>
                  Item: {item.productId} / {item.colorId}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => moveToWishlist(item.productId, item.colorId)}
                    aria-pressed={isWishlisted(item.productId, item.colorId)}
                    className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-[11px] transition ${
                      isWishlisted(item.productId, item.colorId)
                        ? "border-wine bg-wine text-ivory"
                        : "border-[#d7c9b7] bg-[#f8f2ea] text-[#5b5149]"
                    }`}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5"
                      fill={isWishlisted(item.productId, item.colorId) ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <path d="M12 20s-6.7-4.4-9-8.2C1.2 9 2.4 5.9 5.4 5a5.2 5.2 0 0 1 5 1.4L12 8l1.6-1.6a5.2 5.2 0 0 1 5-1.4c3 .9 4.2 4 2.4 6.8-2.3 3.8-9 8.2-9 8.2Z" />
                    </svg>
                    <span>
                      {isWishlisted(item.productId, item.colorId)
                        ? "In Wishlist"
                        : "Move to Wishlist"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeFromCart(item.productId, item.colorId)}
                    className="rounded-sm border border-[#f0e0e3] bg-[#fdf5f6] px-3 py-1.5 text-[11px] text-[#7a2b3b]"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {detailed.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[#d8cab8] bg-[#f8f2ea] p-8 text-center text-[#4e4038]">
          Your bag is empty.{" "}
          <Link href="/" className="font-semibold text-wine">
            Continue shopping
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
          <section className="space-y-4">
            {detailed.map((item) => (
              <article
                key={item.key}
                className="flex gap-4 rounded-2xl border border-[#e4d8ca] bg-[#fbf8f2] p-4"
              >
                <div className="relative h-24 w-24 overflow-hidden rounded-xl">
                  <Image
                    src={item.imageUrl}
                    alt={item.product.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="flex-1">
                  <h2 className="font-serif text-xl text-ink">
                    {item.product.name}
                  </h2>
                  <p className="text-xs uppercase tracking-[0.12em] text-[#5c4a42]">
                    Color: {item.selectedColor.name}
                  </p>
                  <p className="text-sm text-[#4e4038]">
                    Rs{" "}
                    {(item.unitPrice / 100).toLocaleString("en-IN")}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => addToCart(item.productId, item.colorId, -1)}
                      className="rounded-sm border border-[#e4d9d0] px-3 py-1.5 text-[11px]"
                    >
                      -
                    </button>
                    <span className="text-sm">Qty {item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => addToCart(item.productId, item.colorId, 1)}
                      className="rounded-sm border border-[#e4d9d0] px-3 py-1.5 text-[11px]"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.productId, item.colorId)}
                      className="rounded-sm border border-[#f0e0e3] bg-[#fdf5f6] px-3 py-1.5 text-[11px] text-[#7a2b3b]"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => moveToWishlist(item.productId, item.colorId)}
                      aria-pressed={isWishlisted(item.productId, item.colorId)}
                      className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-[11px] transition ${
                        isWishlisted(item.productId, item.colorId)
                          ? "border-wine bg-wine text-ivory"
                          : "border-[#d7c9b7] bg-[#f8f2ea] text-[#5b5149]"
                      }`}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5"
                        fill={isWishlisted(item.productId, item.colorId) ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden="true"
                      >
                        <path d="M12 20s-6.7-4.4-9-8.2C1.2 9 2.4 5.9 5.4 5a5.2 5.2 0 0 1 5 1.4L12 8l1.6-1.6a5.2 5.2 0 0 1 5-1.4c3 .9 4.2 4 2.4 6.8-2.3 3.8-9 8.2-9 8.2Z" />
                      </svg>
                      <span>
                        {isWishlisted(item.productId, item.colorId)
                          ? "In Wishlist"
                          : "Move to Wishlist"}
                      </span>
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>

          <aside className="h-fit rounded-2xl border border-[#e4d8ca] bg-[#fbf8f2] p-5">
            <h3 className="font-serif text-2xl text-ink">Summary</h3>
            <p className="mt-2 text-sm text-[#4e4038]">
              Subtotal: Rs {(total / 100).toLocaleString("en-IN")}
            </p>
            <Link
              href="/checkout"
              className="mt-4 inline-block rounded-sm bg-ink px-6 py-2.5 text-[11px] uppercase tracking-[0.18em] text-[#faf8f5]"
            >
              Proceed to Checkout
            </Link>
          </aside>
        </div>
      )}
    </main>
  );
}
