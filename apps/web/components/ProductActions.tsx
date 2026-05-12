"use client";

import { useMemo } from "react";
import { useStore } from "@/components/StoreProvider";
import PayNowButton from "@/components/PayNowButton";

type Props = {
  productId: string;
  productColorId: string;
  priceInPaise: number;
  inStock: boolean;
};

export default function ProductActions({
  productId,
  productColorId,
  priceInPaise,
  inStock,
}: Props) {
  const { toggleWishlist, isWishlisted, addToCart } = useStore();

  const checkoutItems = useMemo(
    () => [{ productId, productColorId, quantity: 1 }],
    [productColorId, productId],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => toggleWishlist(productId, productColorId)}
          className="rounded-sm border border-[#e4d9d0] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-[#5c4e44] transition hover:border-[#c5b9ae] hover:bg-[#faf8f5]"
        >
          {isWishlisted(productId, productColorId)
            ? "Wishlisted"
            : "Add to Wishlist"}
        </button>

        <button
          type="button"
          onClick={() => addToCart(productId, productColorId, 1)}
          disabled={!inStock}
          className="rounded-sm border border-[#e4d9d0] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-[#5c4e44] transition hover:border-[#c5b9ae] hover:bg-[#faf8f5] disabled:opacity-40"
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
