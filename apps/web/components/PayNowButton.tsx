"use client";

import { useState } from "react";
import { createRazorpayOrder, releaseStockReservation, verifyRazorpayPayment } from "@/lib/api";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/StoreProvider";

const RAZORPAY_CHECKOUT_SDK_URL = "https://checkout.razorpay.com/v1/checkout.js";
let razorpaySdkLoadPromise: Promise<void> | null = null;

function loadRazorpayCheckoutSdk() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay SDK can only load in the browser"));
  }
  if (window.Razorpay) return Promise.resolve();
  if (razorpaySdkLoadPromise) return razorpaySdkLoadPromise;

  razorpaySdkLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(
      `script[src="${RAZORPAY_CHECKOUT_SDK_URL}"]`,
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Unable to load Razorpay SDK")), { once: true });
      if (window.Razorpay) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = RAZORPAY_CHECKOUT_SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load Razorpay SDK"));
    document.body.appendChild(script);
  }).catch((err) => {
    razorpaySdkLoadPromise = null;
    throw err;
  });

  return razorpaySdkLoadPromise;
}

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (e: unknown) => void) => void;
    };
  }
}

type Props = {
  items: Array<{ productId: string; productColorId: string; quantity: number }>;
  amountInPaise: number;
  label?: string;
  customerUserId?: string;
  deliveryAddressId?: string;
  /** When true, button is disabled until a delivery address is selected. */
  requireDeliveryAddress?: boolean;
  onPaymentStateChange?: (isProcessing: boolean) => void;
  onSuccess?: (orderId: string) => void;
};

export default function PayNowButton({
  items,
  amountInPaise,
  label = "Checkout",
  customerUserId,
  deliveryAddressId,
  requireDeliveryAddress = false,
  onPaymentStateChange,
  onSuccess,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { clearCart } = useStore();

  const missingAddress = requireDeliveryAddress && !deliveryAddressId;
  const isDisabled =
    loading ||
    sessionStatus === "loading" ||
    missingAddress ||
    items.length === 0 ||
    amountInPaise <= 0;

  const launchCheckout = async () => {
    if (sessionStatus === "unauthenticated" || !session?.user) {
      const callbackUrl = typeof window !== "undefined" ? window.location.pathname : "/";
      router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return;
    }

    if (!session.user.mobile) {
      const callbackUrl = typeof window !== "undefined" ? window.location.pathname : "/";
      router.push(`/complete-profile?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return;
    }

    if (missingAddress) {
      setStatusText("Please select a delivery address before payment.");
      return;
    }

    setLoading(true);
    setStatusText("Securing your items...");
    onPaymentStateChange?.(true);

    let razorpayOrderId: string | undefined;

    try {
      const [order] = await Promise.all([
        createRazorpayOrder({
          customerName: session.user.name ?? "Shopper",
          customerEmail: session.user.email ?? "noreply@example.com",
          customerPhone: session.user.mobile,
          customerUserId,
          deliveryAddressId,
          items,
        }),
        loadRazorpayCheckoutSdk(),
      ]);

      razorpayOrderId = order.razorpayOrderId as string;

      if (!window.Razorpay) throw new Error("Razorpay SDK not loaded");

      setStatusText("Opening payment...");

      await new Promise<void>((resolveFlow, rejectFlow) => {
        let settled = false;

        const finish = (err?: Error) => {
          if (settled) return;
          settled = true;
          setLoading(false);
          setStatusText("");
          onPaymentStateChange?.(false);
          if (err) rejectFlow(err);
          else resolveFlow();
        };

        const rz = new window.Razorpay({
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount: order.amount,
          currency: order.currency,
          name: "Seere Yaana",
          description: "Secure checkout",
          image: process.env.NEXT_PUBLIC_BRAND_LOGO,
          order_id: razorpayOrderId,
          theme: { color: "#6A1F2B" },
          prefill: {
            name: session.user.name ?? "",
            email: session.user.email ?? "",
            contact: session.user.mobile ?? "",
          },

          // ── Payment success ────────────────────────────────────────────────
          handler: async (response: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            try {
              setStatusText("Confirming payment...");
              const result = await verifyRazorpayPayment(response);
              clearCart();
              finish();
              onSuccess?.(result.orderId);
              router.push(`/orders?paymentSuccess=1&orderId=${result.orderId}`);
            } catch (verifyErr) {
              // Verification failed — release the reservation so the user can retry
              void releaseStockReservation({ razorpayOrderId: razorpayOrderId! });
              finish(verifyErr instanceof Error ? verifyErr : new Error("Payment confirmation failed"));
            }
          },

          modal: {
            // User closed the modal without paying
            ondismiss: () => {
              void releaseStockReservation({ razorpayOrderId: razorpayOrderId! });
              finish();
            },
          },
        });

        // ── Payment failed (card declined, etc.) ───────────────────────────
        rz.on("payment.failed", (event: unknown) => {
          console.error("payment.failed", event);
          void releaseStockReservation({ razorpayOrderId: razorpayOrderId! });
          finish(new Error("Payment failed. Please try again or use a different payment method."));
        });

        rz.open();
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to start payment. Please try again.";
      setStatusText(message);
      setLoading(false);
      onPaymentStateChange?.(false);
      // If we never got a razorpayOrderId, release by customerId as fallback
      if (!razorpayOrderId && customerUserId) {
        void releaseStockReservation({ customerUserId });
      }
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={launchCheckout}
        disabled={isDisabled}
        className="w-full rounded-sm bg-ink px-8 py-3 text-[11px] uppercase tracking-[0.18em] text-[#faf8f5] transition hover:bg-wine disabled:cursor-not-allowed disabled:opacity-40"
      >
        {sessionStatus === "loading"
          ? "Checking session..."
          : loading
            ? statusText || "Processing..."
            : missingAddress
              ? "Select a delivery address to continue"
              : `${label} · ₹${(amountInPaise / 100).toLocaleString("en-IN")}`}
      </button>
      {statusText && !loading ? (
        <p className="text-center text-xs text-rose-600">{statusText}</p>
      ) : null}
    </div>
  );
}
