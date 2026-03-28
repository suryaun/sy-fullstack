"use client";

import { useMemo } from "react";
import Link from "next/link";
import PayNowButton from "@/components/PayNowButton";
import { useStore } from "@/components/StoreProvider";
import { catalogProducts } from "@/lib/catalog";

export default function CheckoutPage() {
  const { cartItems } = useStore();

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
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-serif text-3xl text-ink">Checkout</h1>

      {detailed.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[#d8cab8] bg-[#f8f2ea] p-8 text-center text-[#6b625b]">
          No items to checkout.{" "}
          <Link href="/bag" className="font-semibold text-wine">
            Open bag
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-4 rounded-2xl border border-[#e4d8ca] bg-[#fbf8f2] p-6">
          {detailed.map((item) => (
            <div
              key={item.productId}
              className="flex items-center justify-between text-sm text-[#5d554f]"
            >
              <span>
                {item.product!.name} x {item.quantity}
              </span>
              <span>
                Rs{" "}
                {(
                  (item.product!.priceInPaise * item.quantity) /
                  100
                ).toLocaleString("en-IN")}
              </span>
            </div>
          ))}

          <div className="border-t border-[#e4d8ca] pt-4 text-base font-semibold text-ink">
            Total: Rs {(total / 100).toLocaleString("en-IN")}
          </div>

          <PayNowButton
            items={detailed.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            }))}
            amountInPaise={total}
            label="Pay Securely"
          />
        </div>
      )}
    </main>
  );
}
