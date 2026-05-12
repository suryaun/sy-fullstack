"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import AddressManager from "@/components/AddressManager";
import PayNowButton from "@/components/PayNowButton";
import { useStore } from "@/components/StoreProvider";
import { getPublicApiUrl } from "@/lib/publicApiUrl";

type ApiCheckoutProduct = {
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

export default function CheckoutPage() {
  const {
    cartItems,
    removeFromCart,
    toggleWishlist,
    isWishlisted,
    legacyCartEntries,
    clearLegacyCartEntries,
  } = useStore();
  const { data: session } = useSession();
  const [allProducts, setAllProducts] = useState<ApiCheckoutProduct[]>([]);
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState("");

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

        const apiProducts = (await response.json()) as ApiCheckoutProduct[];
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

          const unitPrice = selectedColor.priceInPaise ?? product.priceInPaise;

          return [{
            ...item,
            product,
            selectedColor,
            unitPrice
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
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-serif text-3xl text-ink">Checkout</h1>

      {legacyCartEntries.length > 0 ? (
        <div className="mt-4 rounded-xl border border-[#e4d8ca] bg-[#fff7ed] p-3 text-sm text-[#4e4038]">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-[#5b5149]">
              Legacy bag entries without color were rejected and cannot be checked out.
            </p>
            <button
              type="button"
              onClick={clearLegacyCartEntries}
              className="shrink-0 rounded-sm border border-[#e4d9d0] px-3 py-1.5 text-[11px]"
            >
              Dismiss
            </button>
          </div>
          <ul className="mt-1 space-y-1 text-xs">
            {legacyCartEntries.map((entry) => (
              <li key={`legacy-checkout-${entry.key}`}>
                Rejected item: {entry.productId ?? entry.key} | Qty {entry.quantity}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {unavailableItems.length > 0 ? (
        <div className="mt-4 rounded-xl border border-[#e4d8ca] bg-[#fff7ed] p-3 text-sm text-[#4e4038]">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-[#5b5149]">
              Remove unavailable items from bag before payment.
            </p>
            <button
              type="button"
              onClick={removeAllUnavailableItems}
              className="shrink-0 rounded-sm border border-[#e4d9d0] px-3 py-1.5 text-[11px]"
            >
              Remove all
            </button>
          </div>
          <p className="mt-1 text-xs">
            Unavailable item IDs: {unavailableItems
              .map((item) => `${item.productId}/${item.colorId}`)
              .join(", ")}
          </p>
        </div>
      ) : null}

      {detailed.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-[#d8cab8] bg-[#f8f2ea] p-8 text-center text-[#4e4038]">
          No items to checkout.{" "}
          <Link href="/bag" className="font-semibold text-wine">
            Open bag
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-4 rounded border border-[#e4d9d0] bg-white p-6">
          <AddressManager
            title="Delivery Address"
            emptyMessage="No saved address yet. Add one to continue with checkout."
            selectedAddressLabel="Using"
            compactSelectionMode
            lockInteractions={isPaymentProcessing}
            lockMessage="Please wait for the payment flow to complete."
            onSelectedAddressIdChange={setSelectedAddressId}
          />

          {detailed.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between text-sm text-[#4e4038]"
            >
              <div>
                <span>
                  {item.product.name} ({item.selectedColor.name}) x {item.quantity}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span>
                  Rs{" "}
                  {(
                    (item.unitPrice * item.quantity) /
                    100
                  ).toLocaleString("en-IN")}
                </span>
                <button
                  type="button"
                  onClick={() => moveToWishlist(item.productId, item.colorId)}
                  disabled={isPaymentProcessing}
                  aria-pressed={isWishlisted(item.productId, item.colorId)}
                  className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-[11px] transition disabled:opacity-40 ${
                    isWishlisted(item.productId, item.colorId)
                      ? "border-ink bg-ink text-[#faf8f5]"
                      : "border-[#e4d9d0] bg-[#faf8f5] text-[#5c4e44] hover:border-[#c5b9ae]"
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
          ))}

          <div className="border-t border-[#e4d8ca] pt-4 text-base font-semibold text-ink">
            Total: Rs {(total / 100).toLocaleString("en-IN")}
          </div>

          {unavailableItems.length === 0 ? (
            <PayNowButton
              items={detailed.map((item) => ({
                productId: item.productId,
                productColorId: item.colorId,
                quantity: item.quantity,
              }))}
              amountInPaise={total}
              label="Pay Securely"
              customerUserId={session?.user?.id}
              deliveryAddressId={selectedAddressId || undefined}
              requireDeliveryAddress
              onPaymentStateChange={setIsPaymentProcessing}
            />
          ) : null}
        </div>
      )}
    </main>
  );
}
