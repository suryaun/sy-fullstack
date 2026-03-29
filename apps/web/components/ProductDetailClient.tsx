"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import PayNowButton from "@/components/PayNowButton";
import { useStore } from "@/components/StoreProvider";
import { getPublicApiUrl } from "@/lib/publicApiUrl";

type ProductColorImage = {
  imageUrl: string;
  sortOrder?: number;
};

type ProductImage = {
  imageUrl: string;
  sortOrder?: number;
};

type ProductColor = {
  id: string;
  name: string;
  colorCode?: string | null;
  isDefault: boolean;
  stockQuantity: number;
  priceInPaise?: number | null;
  images: ProductColorImage[];
};

type ProductDetailView = {
  id: string;
  name: string;
  description: string;
  longDescription?: string;
  fabric: string;
  craft: string;
  lengthInMeters: number;
  blouseIncluded: boolean;
  priceInPaise: number;
  stockStatus: "IN_STOCK" | "SOLD_OUT";
  care?: string;
  work?: string;
  occasion?: string;
  images?: ProductImage[];
  colors: ProductColor[];
  defaultColorId?: string | null;
};

type Props = {
  product: ProductDetailView;
};

export default function ProductDetailClient({ product }: Props) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { addToCart, toggleWishlist, isWishlisted } = useStore();

  const initialColorId =
    product.defaultColorId ??
    product.colors.find((color) => color.isDefault)?.id ??
    product.colors[0]?.id;
  const [selectedColorId, setSelectedColorId] = useState<string | undefined>(
    initialColorId ?? undefined,
  );
  const [notifySubmitting, setNotifySubmitting] = useState(false);
  const [notifyStatusByColor, setNotifyStatusByColor] = useState<
    Record<string, boolean>
  >({});
  const [notifyMessage, setNotifyMessage] = useState("");
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  const selectedColor = useMemo(
    () =>
      product.colors.find((color) => color.id === selectedColorId) ??
      product.colors[0],
    [product.colors, selectedColorId],
  );

  const gallery = useMemo(() => {
    const colorImages = (selectedColor?.images ?? [])
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((item) => item.imageUrl)
      .filter(Boolean);
    const productImages = (product.images ?? [])
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((item) => item.imageUrl)
      .filter(Boolean);

    const merged = [...colorImages, ...productImages];
    const deduped = merged.filter(
      (image, index) => merged.indexOf(image) === index,
    );

    if (deduped.length > 0) {
      return deduped;
    }

    return [] as string[];
  }, [product.images, selectedColor]);

  useEffect(() => {
    setSelectedImageIndex(0);
    setIsZoomed(false);
  }, [selectedColorId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(pointer: coarse)");
    const syncPointerMode = () => {
      setIsCoarsePointer(mediaQuery.matches);
    };

    syncPointerMode();
    mediaQuery.addEventListener("change", syncPointerMode);
    return () => {
      mediaQuery.removeEventListener("change", syncPointerMode);
    };
  }, []);

  useEffect(() => {
    if (selectedImageIndex >= gallery.length) {
      setSelectedImageIndex(0);
    }
  }, [gallery.length, selectedImageIndex]);

  const effectivePrice = selectedColor?.priceInPaise ?? product.priceInPaise;
  const inStock = (selectedColor?.stockQuantity ?? 0) > 0;
  const checkoutItems = [{ productId: product.id, quantity: 1 }];
  const isNotifyDone = selectedColor
    ? Boolean(notifyStatusByColor[selectedColor.id])
    : false;

  useEffect(() => {
    const loadNotifyStatus = async () => {
      if (status !== "authenticated" || !session?.user?.id) {
        return;
      }

      try {
        const apiUrl = getPublicApiUrl();
        const response = await fetch(
          `${apiUrl}/api/products/${product.id}/notify-me-status?customerId=${encodeURIComponent(session.user.id)}`,
        );

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          requestedColorIds?: string[];
        };
        const next: Record<string, boolean> = {};
        for (const colorId of payload.requestedColorIds ?? []) {
          next[colorId] = true;
        }
        setNotifyStatusByColor(next);
      } catch {
        // Best-effort status hydration; ignore network failures.
      }
    };

    void loadNotifyStatus();
  }, [product.id, session?.user?.id, status]);

  const onNotifyMe = async () => {
    if (!selectedColor) {
      return;
    }

    if (status !== "authenticated" || !session?.user?.id) {
      router.push(
        `/login?callbackUrl=${encodeURIComponent(`/products/${product.id}`)}`,
      );
      return;
    }

    setNotifySubmitting(true);
    setNotifyMessage("");

    try {
      const apiUrl = getPublicApiUrl();
      const response = await fetch(
        `${apiUrl}/api/products/${product.id}/notify-me`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId: session.user.id,
            productColorId: selectedColor.id,
          }),
        },
      );

      if (response.status === 409) {
        setNotifyStatusByColor((previous) => ({
          ...previous,
          [selectedColor.id]: true,
        }));
        setNotifyMessage("You are already subscribed for this color.");
        return;
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(
          payload.message ?? "Unable to subscribe for notifications",
        );
      }

      setNotifyStatusByColor((previous) => ({
        ...previous,
        [selectedColor.id]: true,
      }));
      setNotifyMessage(
        "You will be notified when this color is back in stock.",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to subscribe for notifications";
      setNotifyMessage(message);
    } finally {
      setNotifySubmitting(false);
    }
  };

  const goToPreviousImage = useCallback(() => {
    if (gallery.length === 0) {
      return;
    }
    setSelectedImageIndex((previous) =>
      previous === 0 ? gallery.length - 1 : previous - 1,
    );
  }, [gallery.length]);

  const goToNextImage = useCallback(() => {
    if (gallery.length === 0) {
      return;
    }
    setSelectedImageIndex((previous) =>
      previous === gallery.length - 1 ? 0 : previous + 1,
    );
  }, [gallery.length]);

  useEffect(() => {
    if (gallery.length <= 1) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingElement =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (isTypingElement || isZoomed) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPreviousImage();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNextImage();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [gallery.length, goToNextImage, goToPreviousImage, isZoomed]);

  const onImageTouchStart: React.TouchEventHandler<HTMLDivElement> = (
    event,
  ) => {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const onImageTouchEnd: React.TouchEventHandler<HTMLDivElement> = (event) => {
    const touch = event.changedTouches[0];
    const start = touchStartRef.current;
    touchStartRef.current = null;

    if (!touch || !start) {
      return;
    }

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const horizontalDistance = Math.abs(deltaX);
    const verticalDistance = Math.abs(deltaY);

    // Trigger slide change only for clear horizontal swipes.
    if (
      isZoomed ||
      horizontalDistance < 40 ||
      horizontalDistance <= verticalDistance
    ) {
      return;
    }

    if (deltaX > 0) {
      goToPreviousImage();
      return;
    }

    goToNextImage();
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6 text-sm text-[#766d66]">
        <Link href="/" className="hover:text-wine">
          Home
        </Link>{" "}
        / <span>{product.name}</span>
      </div>

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          <div
            className="relative h-[520px] overflow-hidden rounded-2xl border border-[#e2d6c8] bg-[#f8f4ee]"
            onTouchStart={onImageTouchStart}
            onTouchEnd={onImageTouchEnd}
          >
            <TransformWrapper
              key={`${selectedColor?.id ?? "default"}-${selectedImageIndex}`}
              initialScale={1}
              minScale={1}
              maxScale={4}
              limitToBounds
              centerOnInit
              smooth
              panning={{
                velocityDisabled: false,
                disabled: !isZoomed,
              }}
              wheel={{ disabled: true }}
              pinch={{ step: 5 }}
              doubleClick={{ mode: "toggle", step: 2.2 }}
              onTransformed={(_ref, state) => {
                setIsZoomed(state.scale > 1.01);
              }}
            >
              {({ resetTransform, instance }) => {
                const scale = instance?.transformState?.scale ?? 1;

                return (
                  <>
                    <TransformComponent
                      wrapperClass="!h-[520px] !w-full"
                      contentClass="!h-[520px] !w-full"
                      wrapperStyle={{
                        touchAction:
                          isCoarsePointer && !isZoomed ? "pan-y" : "none",
                      }}
                    >
                      {gallery[selectedImageIndex] ? (
                        <div className="relative h-[520px] w-full">
                          <Image
                            src={gallery[selectedImageIndex]}
                            alt={product.name}
                            fill
                            className="object-cover"
                            priority
                          />
                        </div>
                      ) : null}
                    </TransformComponent>

                    {scale > 1.01 ? (
                      <button
                        type="button"
                        onClick={() => resetTransform()}
                        className="absolute right-2 top-2 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-[#3f3731]"
                      >
                        Reset
                      </button>
                    ) : null}

                    {gallery.length > 1 ? (
                      <>
                        <button
                          type="button"
                          onClick={goToPreviousImage}
                          aria-label="Previous image"
                          className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-xl text-white transition hover:bg-black/60"
                        >
                          &#8249;
                        </button>
                        <button
                          type="button"
                          onClick={goToNextImage}
                          aria-label="Next image"
                          className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-xl text-white transition hover:bg-black/60"
                        >
                          &#8250;
                        </button>
                      </>
                    ) : null}
                  </>
                );
              }}
            </TransformWrapper>
          </div>

          {gallery.length > 1 ? (
            <div className="flex items-center justify-center gap-2">
              {gallery.map((_, idx) => {
                const isActive = idx === selectedImageIndex;
                return (
                  <button
                    key={`dot-${product.id}-${idx}`}
                    type="button"
                    onClick={() => setSelectedImageIndex(idx)}
                    aria-label={`Go to image ${idx + 1}`}
                    className={`h-2.5 rounded-full transition-all ${isActive ? "w-6 bg-[#6A1F2B]" : "w-2.5 bg-[#cdbdab] hover:bg-[#b79f89]"}`}
                  />
                );
              })}
            </div>
          ) : null}

          <div className="hidden grid-cols-4 gap-3 md:grid">
            {gallery.map((image, idx) => (
              <button
                key={`${product.id}-${selectedColor?.id ?? "default"}-${idx}`}
                type="button"
                onClick={() => setSelectedImageIndex(idx)}
                className={`relative h-28 overflow-hidden rounded-xl border bg-[#f8f4ee] ${selectedImageIndex === idx ? "border-[#6A1F2B]" : "border-[#e2d6c8]"}`}
              >
                <Image
                  src={image}
                  alt={`${product.name} view ${idx + 1}`}
                  fill
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <p className="text-xs uppercase tracking-[0.25em] text-[#8a7b6c]">
            {product.craft}
          </p>
          <h1 className="font-serif text-4xl text-ink">{product.name}</h1>
          <p className="text-2xl font-semibold text-ink">
            Rs {(effectivePrice / 100).toLocaleString("en-IN")}
          </p>
          <p className="text-sm leading-relaxed text-[#5d554f]">
            {product.longDescription ?? product.description}
          </p>

          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-[#6b625b]">
              Color
            </p>
            <div className="flex flex-wrap gap-2">
              {product.colors.map((color) => {
                const selected = color.id === selectedColor?.id;
                return (
                  <button
                    key={color.id}
                    type="button"
                    onClick={() => {
                      setSelectedColorId(color.id);
                      setNotifyMessage("");
                    }}
                    className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${selected ? "border-wine bg-wine text-ivory" : "border-[#d7c9b7] text-[#5b5149]"}`}
                  >
                    {color.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-[#e2d6c8] bg-[#fbf8f3] p-4 text-sm text-[#5d554f]">
            <p>
              <strong>Fabric:</strong> {product.fabric}
            </p>
            <p>
              <strong>Craft:</strong> {product.craft}
            </p>
            <p>
              <strong>Work:</strong> {product.work ?? "Handcrafted"}
            </p>
            <p>
              <strong>Length:</strong> {product.lengthInMeters}m
            </p>
            <p>
              <strong>Blouse:</strong>{" "}
              {product.blouseIncluded ? "Included" : "Optional"}
            </p>
            <p>
              <strong>Occasion:</strong>{" "}
              {product.occasion ?? "Festive and occasion wear"}
            </p>
            <p>
              <strong>Care:</strong> {product.care ?? "Dry clean only"}
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => toggleWishlist(product.id)}
                className="rounded-full border border-[#d7c9b7] px-5 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-[#5b5149]"
              >
                {isWishlisted(product.id) ? "Wishlisted" : "Add to Wishlist"}
              </button>

              <button
                type="button"
                onClick={() => addToCart(product.id, 1)}
                disabled={!inStock}
                className="rounded-full border border-[#d7c9b7] px-5 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-[#5b5149] disabled:opacity-50"
              >
                Add to Bag
              </button>
            </div>

            {inStock ? (
              <PayNowButton
                items={checkoutItems}
                amountInPaise={effectivePrice}
                label="Buy Now"
              />
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={onNotifyMe}
                  disabled={notifySubmitting || isNotifyDone}
                  className="rounded-full bg-[#6A1F2B] px-6 py-3 text-sm font-semibold text-ivory disabled:opacity-60"
                >
                  {isNotifyDone
                    ? "Notification Requested"
                    : notifySubmitting
                      ? "Saving..."
                      : "Notify Me"}
                </button>
                {notifyMessage ? (
                  <p className="text-xs text-[#6b625b]">{notifyMessage}</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
