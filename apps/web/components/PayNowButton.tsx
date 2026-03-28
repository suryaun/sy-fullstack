"use client";

import { useState } from "react";
import { createRazorpayOrder, verifyRazorpayPayment } from "@/lib/api";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

type Props = {
  items: Array<{ productId: string; quantity: number }>;
  amountInPaise: number;
  label?: string;
  onSuccess?: () => void;
};

export default function PayNowButton({
  items,
  amountInPaise,
  label = "Checkout",
  onSuccess,
}: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { data: session, status } = useSession();

  const launchCheckout = async () => {
    if (!session?.user) {
      const callbackUrl =
        typeof window !== "undefined" ? window.location.pathname : "/";
      router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      return;
    }

    setLoading(true);
    try {
      const order = await createRazorpayOrder({
        customerName: session.user.name ?? "Guest Buyer",
        customerEmail: session.user.email ?? "guest@example.com",
        customerPhone: "9999999999",
        items,
      });

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: "Seere Yaana",
        description: "Secure checkout",
        image: process.env.NEXT_PUBLIC_BRAND_LOGO,
        order_id: order.razorpayOrderId,
        theme: {
          color: "#6A1F2B",
        },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          await verifyRazorpayPayment(response);
          onSuccess?.();
          alert("Payment successful");
        },
      };

      const rz = new window.Razorpay(options);
      rz.open();
    } catch (error) {
      alert("Unable to start payment. Please try again.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={launchCheckout}
      disabled={loading || status === "loading"}
      className="rounded-full bg-wine px-6 py-3 text-sm font-semibold text-ivory transition hover:bg-[#581923] disabled:opacity-60"
    >
      {status === "loading"
        ? "Checking..."
        : loading
          ? "Preparing..."
          : `${label} Rs ${(amountInPaise / 100).toLocaleString("en-IN")}`}
    </button>
  );
}
