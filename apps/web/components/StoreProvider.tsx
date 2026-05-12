"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type CartMap = Record<string, number>;

type CartItem = {
  key: string;
  productId: string;
  colorId: string;
  quantity: number;
};

type LegacyCartEntry = {
  key: string;
  quantity: number;
  productId: string | null;
  reason: "MISSING_COLOR" | "INVALID_KEY";
};

type StoreContextValue = {
  wishlist: string[];
  wishlistIds: string[];
  cart: CartMap;
  cartItems: CartItem[];
  legacyCartEntries: LegacyCartEntry[];
  wishlistCount: number;
  cartCount: number;
  toggleWishlist: (productId: string, colorId?: string) => void;
  isWishlisted: (productId: string, colorId?: string) => boolean;
  removeWishlistByProduct: (productId: string) => void;
  addToCart: (productId: string, colorId: string, quantity?: number) => void;
  removeFromCart: (productId: string, colorId: string) => void;
  setCartQuantity: (productId: string, colorId: string, quantity: number) => void;
  clearLegacyCartEntries: () => void;
  clearCart: () => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);

const WISHLIST_KEY = "seere_yaana_wishlist";
const CART_KEY = "seere_yaana_cart";

function makeWishlistKey(productId: string, colorId?: string) {
  return `${productId}::${colorId ?? "default"}`;
}

function parseWishlistProductId(wishlistKey: string) {
  return wishlistKey.split("::")[0] ?? wishlistKey;
}

function makeCartKey(productId: string, colorId: string) {
  return `${productId}::${colorId}`;
}

function parseCartKey(cartKey: string) {
  const [productId, colorId] = cartKey.split("::");

  if (!productId || !colorId) {
    return null;
  }

  return {
    productId,
    colorId
  };
}

function parseLegacyProductId(cartKey: string) {
  const [productId] = cartKey.split("::");
  return productId?.trim() ? productId.trim() : null;
}

export default function StoreProvider({ children }: { children: ReactNode }) {
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [cart, setCart] = useState<CartMap>({});
  const [legacyCartEntries, setLegacyCartEntries] = useState<LegacyCartEntry[]>([]);

  useEffect(() => {
    try {
      const savedWishlist = localStorage.getItem(WISHLIST_KEY);
      const savedCart = localStorage.getItem(CART_KEY);

      if (savedWishlist) {
        const parsed = JSON.parse(savedWishlist) as string[];
        // Backward compatibility: migrate old product-only entries.
        const migrated = parsed.map((entry) =>
          entry.includes("::") ? entry : makeWishlistKey(entry),
        );
        setWishlist(migrated);
      }
      if (savedCart) {
        const parsed = JSON.parse(savedCart) as Record<string, unknown>;
        const normalized: CartMap = {};
        const invalidEntries: LegacyCartEntry[] = [];

        for (const [cartKey, quantityRaw] of Object.entries(parsed)) {
          const parsedKey = parseCartKey(cartKey);
          const quantity = Number(quantityRaw);

          if (!Number.isFinite(quantity) || quantity <= 0) {
            continue;
          }

          if (!parsedKey) {
            invalidEntries.push({
              key: cartKey,
              quantity: Math.floor(quantity),
              productId: parseLegacyProductId(cartKey),
              reason: cartKey.includes("::") ? "INVALID_KEY" : "MISSING_COLOR"
            });
            continue;
          }

          normalized[makeCartKey(parsedKey.productId, parsedKey.colorId)] = Math.floor(quantity);
        }

        setCart(normalized);
        setLegacyCartEntries(invalidEntries);
      }
    } catch {
      // Ignore corrupt local storage entries.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
  }, [wishlist]);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  const value = useMemo<StoreContextValue>(() => {
    const wishlistCount = wishlist.length;
    const cartCount = Object.values(cart as CartMap).reduce(
      (sum: number, qty: number) => sum + qty,
      0,
    );

    return {
      wishlist,
      wishlistIds: wishlist,
      cart,
      cartItems: (Object.entries(cart as CartMap) as Array<[string, number]>)
        .map(([cartKey, quantity]) => {
          const parsedKey = parseCartKey(cartKey);
          if (!parsedKey) {
            return null;
          }

          return {
            key: cartKey,
            productId: parsedKey.productId,
            colorId: parsedKey.colorId,
            quantity
          };
        })
        .filter((item): item is CartItem => item !== null)
        .filter((item) => item.quantity > 0),
      legacyCartEntries,
      wishlistCount,
      cartCount,
      toggleWishlist: (productId: string, colorId?: string) => {
        const wishlistKey = makeWishlistKey(productId, colorId);
        setWishlist((previous: string[]) =>
          previous.includes(wishlistKey)
            ? previous.filter((id: string) => id !== wishlistKey)
            : [...previous, wishlistKey],
        );
      },
      isWishlisted: (productId: string, colorId?: string) => {
        if (colorId) {
          return wishlist.includes(makeWishlistKey(productId, colorId));
        }

        return wishlist.some(
          (wishlistKey) => parseWishlistProductId(wishlistKey) === productId,
        );
      },
      removeWishlistByProduct: (productId: string) => {
        setWishlist((previous: string[]) =>
          previous.filter(
            (wishlistKey: string) =>
              parseWishlistProductId(wishlistKey) !== productId,
          ),
        );
      },
      addToCart: (productId: string, colorId: string, quantity = 1) => {
        const cartKey = makeCartKey(productId, colorId);
        setCart((previous: CartMap) => {
          const nextQuantity = (previous[cartKey] ?? 0) + quantity;

          if (nextQuantity <= 0) {
            const updated = { ...previous };
            delete updated[cartKey];
            return updated;
          }

          return {
            ...previous,
            [cartKey]: nextQuantity,
          };
        });
      },
      removeFromCart: (productId: string, colorId: string) => {
        const cartKey = makeCartKey(productId, colorId);
        setCart((previous: CartMap) => {
          const updated = { ...previous };
          delete updated[cartKey];
          return updated;
        });
      },
      setCartQuantity: (productId: string, colorId: string, quantity: number) => {
        const cartKey = makeCartKey(productId, colorId);
        setCart((previous: CartMap) => {
          if (quantity <= 0) {
            const updated = { ...previous };
            delete updated[cartKey];
            return updated;
          }

          return {
            ...previous,
            [cartKey]: quantity,
          };
        });
      },
      clearLegacyCartEntries: () => setLegacyCartEntries([]),
      clearCart: () => setCart({}),
    };
  }, [wishlist, cart, legacyCartEntries]);

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error("useStore must be used within StoreProvider");
  }
  return context;
}
