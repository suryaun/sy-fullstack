"use client";

import { useMemo } from "react";
import { useStore } from "@/components/StoreProvider";
import PayNowButton from "@/components/PayNowButton";

type Props = {
  productId: string;
  priceInPaise: number;
  inStock: boolean;
};

export default function ProductActions({
  productId,
  priceInPaise,
  inStock,
}: Props) {
  const { toggleWishlist, isWishlisted, addToCart } = useStore();

  const checkoutItems = useMemo(
    () => [{ productId, quantity: 1 }],
    [productId],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => toggleWishlist(productId)}
          className="rounded-full border border-[#d7c9b7] px-5 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-[#5b5149]"
        >
          {isWishlisted(productId) ? "Wishlisted" : "Add to Wishlist"}
        </button>

        <button
          type="button"
          onClick={() => addToCart(productId, 1)}
          disabled={!inStock}
          className="rounded-full border border-[#d7c9b7] px-5 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-[#5b5149] disabled:opacity-50"
        >
          Add to Bag
        </button>
      </div>

      {inStock ? (
        <PayNowButton
          items={checkoutItems}
          amountInPaise={priceInPaise}
          label="Buy Now"
        />
      ) : (
        <p className="text-sm font-semibold text-[#6A1F2B]">Sold Out</p>
      )}
    </div>
  );
}
