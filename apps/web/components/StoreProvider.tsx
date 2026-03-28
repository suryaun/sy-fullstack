"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type CartMap = Record<string, number>;

type CartItem = {
  productId: string;
  quantity: number;
};

type StoreContextValue = {
  wishlist: string[];
  wishlistIds: string[];
  cart: CartMap;
  cartItems: CartItem[];
  wishlistCount: number;
  cartCount: number;
  toggleWishlist: (productId: string) => void;
  isWishlisted: (productId: string) => boolean;
  addToCart: (productId: string, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  setCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);

const WISHLIST_KEY = "seere_yaana_wishlist";
const CART_KEY = "seere_yaana_cart";

export default function StoreProvider({ children }: { children: ReactNode }) {
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [cart, setCart] = useState<CartMap>({});

  useEffect(() => {
    try {
      const savedWishlist = localStorage.getItem(WISHLIST_KEY);
      const savedCart = localStorage.getItem(CART_KEY);

      if (savedWishlist) {
        setWishlist(JSON.parse(savedWishlist));
      }
      if (savedCart) {
        setCart(JSON.parse(savedCart));
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
        .map(([productId, quantity]) => ({ productId, quantity }))
        .filter((item) => item.quantity > 0),
      wishlistCount,
      cartCount,
      toggleWishlist: (productId: string) => {
        setWishlist((previous: string[]) =>
          previous.includes(productId)
            ? previous.filter((id: string) => id !== productId)
            : [...previous, productId],
        );
      },
      isWishlisted: (productId: string) => wishlist.includes(productId),
      addToCart: (productId: string, quantity = 1) => {
        setCart((previous: CartMap) => {
          const nextQuantity = (previous[productId] ?? 0) + quantity;

          if (nextQuantity <= 0) {
            const updated = { ...previous };
            delete updated[productId];
            return updated;
          }

          return {
            ...previous,
            [productId]: nextQuantity,
          };
        });
      },
      removeFromCart: (productId: string) => {
        setCart((previous: CartMap) => {
          const updated = { ...previous };
          delete updated[productId];
          return updated;
        });
      },
      setCartQuantity: (productId: string, quantity: number) => {
        setCart((previous: CartMap) => {
          if (quantity <= 0) {
            const updated = { ...previous };
            delete updated[productId];
            return updated;
          }

          return {
            ...previous,
            [productId]: quantity,
          };
        });
      },
      clearCart: () => setCart({}),
    };
  }, [wishlist, cart]);

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
