"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
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
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const { addToCart, toggleWishlist, isWishlisted, cartItems, cartCount } =
    useStore();

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
  const viewerPinchInProgressRef = useRef(false);
  const mobileGalleryTouchStartRef = useRef<{ x: number; y: number } | null>(
    null,
  );
  const mobileSwipeDetectedRef = useRef(false);
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [isViewerZoomed, setIsViewerZoomed] = useState(false);

  // Read color from query parameter
  useEffect(() => {
    const colorFromUrl = searchParams.get("color");
    if (colorFromUrl && product.colors.some((c) => c.id === colorFromUrl)) {
      setSelectedColorId(colorFromUrl);
    }
  }, [searchParams, product.colors]);

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
    setIsViewerZoomed(false);
    setIsImageViewerOpen(false);
    viewerPinchInProgressRef.current = false;
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

  useEffect(() => {
    if (!isImageViewerOpen || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isImageViewerOpen]);

  const effectivePrice = selectedColor?.priceInPaise ?? product.priceInPaise;
  const inStock =
    product.stockStatus === "IN_STOCK" &&
    (selectedColor?.stockQuantity ?? 0) > 0;
  const selectedBagQuantity = useMemo(() => {
    if (!selectedColor) {
      return 0;
    }

    const selectedCartItem = cartItems.find(
      (item) =>
        item.productId === product.id && item.colorId === selectedColor.id,
    );

    return selectedCartItem?.quantity ?? 0;
  }, [cartItems, product.id, selectedColor]);
  const hasAnyBagItems = cartCount > 0;
  const isSelectedColorWishlisted = isWishlisted(product.id, selectedColor?.id);
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

  const closeImageViewer = useCallback(() => {
    setIsImageViewerOpen(false);
    setIsViewerZoomed(false);
    viewerPinchInProgressRef.current = false;
  }, []);

  const openImageViewer = useCallback((index: number) => {
    setSelectedImageIndex(index);
    setIsImageViewerOpen(true);
    setIsViewerZoomed(false);
    viewerPinchInProgressRef.current = false;
  }, []);

  useEffect(() => {
    if (!isImageViewerOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingElement =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (isTypingElement) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeImageViewer();
        return;
      }

      if (gallery.length <= 1 || isViewerZoomed) {
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
  }, [
    closeImageViewer,
    gallery.length,
    goToNextImage,
    goToPreviousImage,
    isImageViewerOpen,
    isViewerZoomed,
  ]);

  const onViewerTouchStart: React.TouchEventHandler<HTMLDivElement> = (
    event,
  ) => {
    if (event.touches.length > 1) {
      viewerPinchInProgressRef.current = true;
      touchStartRef.current = null;
      return;
    }

    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const onViewerTouchMove: React.TouchEventHandler<HTMLDivElement> = (
    event,
  ) => {
    if (event.touches.length > 1) {
      viewerPinchInProgressRef.current = true;
      touchStartRef.current = null;
    }
  };

  const onViewerTouchEnd: React.TouchEventHandler<HTMLDivElement> = (event) => {
    if (viewerPinchInProgressRef.current || event.changedTouches.length > 1) {
      if (event.touches.length === 0) {
        viewerPinchInProgressRef.current = false;
      }
      touchStartRef.current = null;
      return;
    }

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
      isViewerZoomed ||
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

  const onMobileGalleryTouchStart: React.TouchEventHandler<HTMLButtonElement> =
    (event) => {
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      mobileSwipeDetectedRef.current = false;
      mobileGalleryTouchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
      };
    };

  const onMobileGalleryTouchEnd: React.TouchEventHandler<HTMLButtonElement> =
    (event) => {
      const touch = event.changedTouches[0];
      const start = mobileGalleryTouchStartRef.current;
      mobileGalleryTouchStartRef.current = null;

      if (!touch || !start || gallery.length <= 1) {
        return;
      }

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      const horizontalDistance = Math.abs(deltaX);
      const verticalDistance = Math.abs(deltaY);

      if (horizontalDistance < 32 || horizontalDistance <= verticalDistance) {
        return;
      }

      mobileSwipeDetectedRef.current = true;

      if (deltaX > 0) {
        goToPreviousImage();
        return;
      }

      goToNextImage();
    };

  const onMobileHeroClick: React.MouseEventHandler<HTMLButtonElement> = (
    event,
  ) => {
    if (mobileSwipeDetectedRef.current) {
      mobileSwipeDetectedRef.current = false;
      event.preventDefault();
      return;
    }

    openImageViewer(selectedImageIndex);
  };

  return (
    <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <div className="mb-7 text-xs uppercase tracking-[0.15em] text-[#7a6050]">
        <Link href="/" className="transition-colors hover:text-ink">
          Home
        </Link>{" "}
        / <span className="text-[#5c4a42]">{product.name}</span>
      </div>

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          {gallery.length === 0 ? (
            <div className="flex h-[340px] items-center justify-center rounded-2xl border border-dashed border-[#d7c9b7] bg-[#f8f4ee] text-sm text-[#4e4038]">
              Images are not available for this color right now.
            </div>
          ) : (
            <>
              <div className="-mx-6 space-y-3 sm:hidden">
                <button
                  type="button"
                  onClick={onMobileHeroClick}
                  onTouchStart={onMobileGalleryTouchStart}
                  onTouchEnd={onMobileGalleryTouchEnd}
                  className="relative w-full overflow-hidden border-y border-[#e2d6c8] bg-[#f8f4ee]"
                  aria-label={`Open fullscreen image ${selectedImageIndex + 1}`}
                >
                  <div className="relative aspect-[4/5] w-full">
                    <div
                      className="flex h-full transition-transform duration-300 ease-out"
                      style={{
                        transform: `translateX(-${selectedImageIndex * 100}%)`,
                      }}
                    >
                      {gallery.map((image, idx) => (
                        <div
                          key={`mobile-hero-${product.id}-${idx}`}
                          className="relative h-full w-full shrink-0"
                        >
                          <Image
                            src={image}
                            alt={`${product.name} view ${idx + 1}`}
                            fill
                            className="object-cover"
                            sizes="100vw"
                            priority={idx < 2}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent px-4 pb-3 pt-10 text-white">
                    <span className="rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold">
                      {selectedImageIndex + 1}/{gallery.length}
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/90">
                      Tap to Zoom
                    </span>
                    </div>
                </button>

                {gallery.length > 1 ? (
                  <div className="flex items-center justify-center gap-2">
                    {gallery.map((_, idx) => {
                      const isActive = idx === selectedImageIndex;
                      return (
                        <button
                          key={`mobile-dot-${product.id}-${idx}`}
                          type="button"
                          onClick={() => setSelectedImageIndex(idx)}
                          aria-label={`Go to image ${idx + 1}`}
                          className={`h-2.5 rounded-full transition-all ${isActive ? "w-6 bg-[#6A1F2B]" : "w-2.5 bg-[#cdbdab]"}`}
                        />
                      );
                    })}
                  </div>
                ) : null}

                {gallery.length > 1 ? (
                  <div className="flex gap-2 overflow-x-auto px-4 pb-1">
                    {gallery.map((image, idx) => (
                      <button
                        key={`mobile-thumb-${product.id}-${idx}`}
                        type="button"
                        onClick={() => setSelectedImageIndex(idx)}
                        className={`relative h-14 w-11 shrink-0 overflow-hidden rounded-md border ${selectedImageIndex === idx ? "border-[#6A1F2B]" : "border-[#d7c9b7]"}`}
                        aria-label={`Open image ${idx + 1}`}
                      >
                        <Image
                          src={image}
                          alt={`${product.name} thumbnail ${idx + 1}`}
                          fill
                          className="object-cover"
                          sizes="64px"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}

                <p className="px-4 text-xs text-[#4e4038]">
                  Swipe to browse images and tap to open fullscreen.
                </p>
              </div>

              <div className="hidden grid-cols-1 gap-3 sm:grid sm:grid-cols-2">
                {gallery.map((image, idx) => (
                  <button
                    key={`${product.id}-${selectedColor?.id ?? "default"}-${idx}`}
                    type="button"
                    onClick={() => openImageViewer(idx)}
                    className={`group relative overflow-hidden rounded-2xl border bg-[#f8f4ee] text-left transition ${selectedImageIndex === idx ? "border-[#6A1F2B]" : "border-[#e2d6c8] hover:border-[#c8b39c]"}`}
                  >
                    <div className="relative aspect-[3/4] w-full">
                      <Image
                        src={image}
                        alt={`${product.name} view ${idx + 1}`}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        sizes="(max-width: 640px) 100vw, 50vw"
                        priority={idx < 2}
                      />
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-3 pb-3 pt-10 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#f8f5f1] opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                      View fullscreen
                    </div>
                  </button>
                ))}
              </div>

              <p className="hidden text-xs text-[#4e4038] sm:block">
                Click any image to open fullscreen viewer.
              </p>
            </>
          )}
        </div>

        <div className="space-y-5">
          <p className="text-xs uppercase tracking-[0.3em] text-[#7a6050]">
            {product.craft}
          </p>
          <h1 className="font-serif text-4xl leading-tight text-ink sm:text-5xl">{product.name}</h1>
          <p className="font-serif text-2xl text-[#5c4e44]">
            ₹{(effectivePrice / 100).toLocaleString("en-IN")}
          </p>
          <p className="text-sm leading-relaxed text-[#5c4a42]">
            {product.longDescription ?? product.description}
          </p>

          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-[#4e4038]">
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
                    className={`rounded-sm border px-4 py-2 text-[11px] uppercase tracking-[0.16em] transition ${selected ? "border-ink bg-ink text-[#faf8f5]" : "border-[#e4d9d0] text-[#5c4e44] hover:border-[#c5b9ae]"}`}
                  >
                    {color.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded border border-[#e4d9d0] bg-[#faf8f5] p-5 text-sm leading-relaxed text-[#4e4038]">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            <p><span className="font-medium text-[#5c4e44]">Fabric</span> &mdash; {product.fabric}</p>
            <p><span className="font-medium text-[#5c4e44]">Craft</span> &mdash; {product.craft}</p>
            <p><span className="font-medium text-[#5c4e44]">Work</span> &mdash; {product.work ?? "Handcrafted"}</p>
            <p><span className="font-medium text-[#5c4e44]">Length</span> &mdash; {product.lengthInMeters}m</p>
            <p><span className="font-medium text-[#5c4e44]">Blouse</span> &mdash; {product.blouseIncluded ? "Included" : "Optional"}</p>
            <p><span className="font-medium text-[#5c4e44]">Occasion</span> &mdash; {product.occasion ?? "Festive & occasion wear"}</p>
            <p className="col-span-2"><span className="font-medium text-[#5c4e44]">Care</span> &mdash; {product.care ?? "Dry clean only"}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => toggleWishlist(product.id, selectedColor?.id)}
                aria-pressed={isSelectedColorWishlisted}
                className={`inline-flex items-center gap-1.5 rounded-sm border px-5 py-3 text-[11px] uppercase tracking-[0.18em] transition ${
                  isSelectedColorWishlisted
                    ? "border-ink bg-ink text-[#faf8f5]"
                    : "border-[#e4d9d0] bg-[#faf8f5] text-[#5c4e44] hover:border-[#c5b9ae]"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill={isSelectedColorWishlisted ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path d="M12 20s-6.7-4.4-9-8.2C1.2 9 2.4 5.9 5.4 5a5.2 5.2 0 0 1 5 1.4L12 8l1.6-1.6a5.2 5.2 0 0 1 5-1.4c3 .9 4.2 4 2.4 6.8-2.3 3.8-9 8.2-9 8.2Z" />
                </svg>
                <span>
                  {isSelectedColorWishlisted ? "Wishlisted" : "Add to Wishlist"}
                </span>
              </button>

              {selectedBagQuantity > 0 ? (
                <div className="flex items-center gap-2 rounded-sm border border-[#e4d9d0] bg-[#f5f1eb] px-3 py-3 text-[11px] uppercase tracking-[0.12em] text-ink">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="M6.5 9h11l-1.1 9a2 2 0 0 1-2 1.8H9.6a2 2 0 0 1-2-1.8L6.5 9Z" />
                    <path d="M9 9V7a3 3 0 1 1 6 0v2" />
                  </svg>
                  <span>Bag {selectedBagQuantity}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedColor) {
                        return;
                      }

                      addToCart(product.id, selectedColor.id, -1);
                    }}
                    className="rounded-sm border border-[#e4d9d0] bg-white px-2 py-0.5 text-xs"
                    aria-label="Decrease bag quantity"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedColor) {
                        return;
                      }

                      addToCart(product.id, selectedColor.id, 1);
                    }}
                    disabled={
                      !inStock ||
                      !selectedColor ||
                      selectedBagQuantity >= selectedColor.stockQuantity
                    }
                    className="rounded-sm border border-[#e4d9d0] bg-white px-2 py-0.5 text-xs disabled:opacity-40"
                    aria-label="Increase bag quantity"
                  >
                    +
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedColor) {
                      return;
                    }

                    addToCart(product.id, selectedColor.id, 1);
                  }}
                  disabled={!inStock || !selectedColor}
                  className="rounded-sm border border-[#e4d9d0] bg-white px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-[#5c4e44] transition hover:border-[#c5b9ae] hover:bg-[#faf8f5] disabled:opacity-40"
                >
                  Add to Bag
                </button>
              )}
            </div>

            {hasAnyBagItems ? (
              <Link
                href="/checkout"
                className="inline-block rounded-sm bg-ink px-8 py-3 text-[11px] uppercase tracking-[0.18em] text-[#faf8f5] transition hover:bg-wine"
              >
                Checkout
              </Link>
            ) : null}

            {!inStock ? (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={onNotifyMe}
                  disabled={notifySubmitting || isNotifyDone}
                  className="rounded-sm border border-ink px-8 py-3 text-[11px] uppercase tracking-[0.18em] text-ink transition hover:bg-ink hover:text-[#faf8f5] disabled:opacity-50"
                >
                  {isNotifyDone
                    ? "Notification Requested"
                    : notifySubmitting
                      ? "Saving..."
                      : "Notify Me"}
                </button>
                {notifyMessage ? (
                  <p className="text-xs text-[#4e4038]">{notifyMessage}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {isImageViewerOpen && gallery[selectedImageIndex] ? (
        <div
          className="fixed inset-0 z-50 bg-black sm:bg-black/90 sm:px-6 sm:py-5"
          role="dialog"
          aria-modal="true"
          aria-label={`${product.name} image viewer`}
        >
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col">
            <div className="flex items-center justify-between px-3 py-3 text-white sm:mb-3 sm:px-0 sm:py-0">
              <p className="text-xs uppercase tracking-[0.15em] text-white/80 sm:text-xs">
                Image {selectedImageIndex + 1} of {gallery.length}
              </p>
              <button
                type="button"
                onClick={closeImageViewer}
                className="rounded-full border border-white/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-white transition hover:border-white sm:px-4 sm:py-2 sm:text-xs"
              >
                X
              </button>
            </div>

            <div
              className="relative flex-1 overflow-hidden bg-black sm:rounded-2xl sm:border sm:border-white/15"
              onTouchStart={onViewerTouchStart}
              onTouchMove={onViewerTouchMove}
              onTouchEnd={onViewerTouchEnd}
            >
              <TransformWrapper
                key={`${selectedColor?.id ?? "default"}-viewer-${selectedImageIndex}`}
                initialScale={1}
                minScale={1}
                maxScale={6.5}
                limitToBounds
                centerOnInit
                smooth
                panning={{
                  velocityDisabled: false,
                  disabled: !isViewerZoomed,
                }}
                wheel={{ step: 0.28 }}
                pinch={{ step: 22 }}
                doubleClick={{ mode: "toggle", step: 2.8 }}
                onTransformed={(_ref, state) => {
                  setIsViewerZoomed(state.scale > 1.01);
                }}
              >
                {({ instance, resetTransform, zoomIn, zoomOut }) => {
                  const scale = instance?.transformState?.scale ?? 1;

                  return (
                    <>
                      <div className="absolute bottom-4 right-3 z-20 flex items-center gap-2 sm:left-3 sm:top-3 sm:bottom-auto sm:right-auto">
                        <button
                          type="button"
                          onClick={() => zoomOut(0.35)}
                          className="rounded-md bg-black/60 px-3 py-1.5 text-sm font-semibold text-white"
                          aria-label="Zoom out"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() => zoomIn(0.35)}
                          className="rounded-md bg-black/60 px-3 py-1.5 text-sm font-semibold text-white"
                          aria-label="Zoom in"
                        >
                          +
                        </button>
                        {scale > 1.01 ? (
                          <button
                            type="button"
                            onClick={() => resetTransform()}
                            className="rounded-md bg-black/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-white"
                            aria-label="Reset zoom"
                          >
                            Reset
                          </button>
                        ) : null}
                      </div>

                      <TransformComponent
                        wrapperClass="!h-full !w-full"
                        contentClass="!h-full !w-full"
                        wrapperStyle={{
                          touchAction:
                            isCoarsePointer && !isViewerZoomed
                              ? "pan-y"
                              : "none",
                        }}
                      >
                        <div className="relative h-full w-full">
                          <Image
                            src={gallery[selectedImageIndex]}
                            alt={`${product.name} zoom view ${selectedImageIndex + 1}`}
                            fill
                            className="object-contain"
                            sizes="100vw"
                            priority
                          />
                        </div>
                      </TransformComponent>

                      {gallery.length > 1 && !isViewerZoomed ? (
                        <>
                          <button
                            type="button"
                            onClick={goToPreviousImage}
                            aria-label="Previous image"
                            className="absolute left-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-2xl text-white transition hover:bg-black/70 sm:flex"
                          >
                            &#8249;
                          </button>
                          <button
                            type="button"
                            onClick={goToNextImage}
                            aria-label="Next image"
                            className="absolute right-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-2xl text-white transition hover:bg-black/70 sm:flex"
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
              <div className="mt-3 hidden gap-2 overflow-x-auto pb-1 sm:flex">
                {gallery.map((image, idx) => (
                  <button
                    key={`viewer-thumb-${product.id}-${idx}`}
                    type="button"
                    onClick={() => {
                      setSelectedImageIndex(idx);
                      setIsViewerZoomed(false);
                    }}
                    className={`relative h-16 w-12 shrink-0 overflow-hidden rounded-md border ${selectedImageIndex === idx ? "border-white" : "border-white/30"}`}
                    aria-label={`Open image ${idx + 1}`}
                  >
                    <Image
                      src={image}
                      alt={`${product.name} thumbnail ${idx + 1}`}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  </button>
                ))}
              </div>
            ) : null}

            {gallery.length > 1 ? (
              <div className="flex items-center justify-center gap-2 px-3 py-3 sm:hidden">
                {gallery.map((_, idx) => {
                  const isActive = idx === selectedImageIndex;
                  return (
                    <button
                      key={`viewer-mobile-dot-${product.id}-${idx}`}
                      type="button"
                      onClick={() => {
                        setSelectedImageIndex(idx);
                        setIsViewerZoomed(false);
                      }}
                      aria-label={`Open image ${idx + 1}`}
                      className={`h-2 rounded-full transition-all ${isActive ? "w-6 bg-white" : "w-2 bg-white/45"}`}
                    />
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
