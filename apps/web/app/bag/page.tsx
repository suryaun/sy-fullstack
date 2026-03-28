"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/components/StoreProvider";
import { catalogProducts } from "@/lib/catalog";

export default function BagPage() {
  const { cartItems, addToCart, removeFromCart } = useStore();

  const detailed = useMemo(
    () =>
      cartItems
        .map((item) => ({
          ...item,
          product: catalogProducts.find(
            (product) => product.id === item.productId,
          ),
        }))
        .filter((item) => item.product),
    [cartItems],
  );

  const total = detailed.reduce(
    (sum, item) => sum + (item.product?.priceInPaise ?? 0) * item.quantity,
    0,
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="font-serif text-3xl text-ink">Shopping Bag</h1>

      {detailed.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[#d8cab8] bg-[#f8f2ea] p-8 text-center text-[#6b625b]">
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
                key={item.productId}
                className="flex gap-4 rounded-2xl border border-[#e4d8ca] bg-[#fbf8f2] p-4"
              >
                <div className="relative h-24 w-24 overflow-hidden rounded-xl">
                  <Image
                    src={item.product!.images[0]}
                    alt={item.product!.name}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="flex-1">
                  <h2 className="font-serif text-xl text-ink">
                    {item.product!.name}
                  </h2>
                  <p className="text-sm text-[#6b625b]">
                    Rs{" "}
                    {(item.product!.priceInPaise / 100).toLocaleString("en-IN")}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => addToCart(item.productId, -1)}
                      className="rounded-full border border-[#d7c9b7] px-3 py-1 text-xs font-semibold"
                    >
                      -
                    </button>
                    <span className="text-sm">Qty {item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => addToCart(item.productId, 1)}
                      className="rounded-full border border-[#d7c9b7] px-3 py-1 text-xs font-semibold"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.productId)}
                      className="rounded-full border border-[#d7c9b7] px-3 py-1 text-xs font-semibold"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>

          <aside className="h-fit rounded-2xl border border-[#e4d8ca] bg-[#fbf8f2] p-5">
            <h3 className="font-serif text-2xl text-ink">Summary</h3>
            <p className="mt-2 text-sm text-[#6b625b]">
              Subtotal: Rs {(total / 100).toLocaleString("en-IN")}
            </p>
            <Link
              href="/checkout"
              className="mt-4 inline-block rounded-full bg-wine px-5 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-ivory"
            >
              Proceed to Checkout
            </Link>
          </aside>
        </div>
      )}
    </main>
  );
}
