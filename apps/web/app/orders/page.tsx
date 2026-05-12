"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { listUserOrders, type UserOrder } from "@/lib/api";

type OrdersTab = "pending" | "tracking";

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function paymentBadgeClasses(status: UserOrder["paymentStatus"]) {
  if (status === "PAID") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (status === "FAILED") {
    return "bg-rose-100 text-rose-700";
  }

  if (status === "CANCELLED") {
    return "bg-zinc-200 text-zinc-700";
  }

  return "bg-amber-100 text-amber-700";
}

function fulfillmentBadgeClasses(fulfillmentStatus: string | null) {
  const normalized = fulfillmentStatus?.toUpperCase() ?? "";

  if (normalized === "DELIVERED" || normalized === "FULFILLED") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (normalized === "IN_TRANSIT" || normalized === "OUT_FOR_DELIVERY") {
    return "bg-sky-100 text-sky-700";
  }

  if (normalized === "CANCELLED") {
    return "bg-zinc-200 text-zinc-700";
  }

  return "bg-violet-100 text-violet-700";
}

function toLabel(value: string | null) {
  if (!value) {
    return "-";
  }

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function OrdersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  if (status === "loading") {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-sm text-[#4e4038]">Checking account...</p>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="font-serif text-3xl text-ink">Orders</h1>
        <p className="mt-3 text-sm text-[#4e4038]">
          Please sign in to view your orders.
        </p>
        <Link
          href="/login?callbackUrl=/orders"
          className="mt-4 inline-block rounded-sm bg-ink px-6 py-2.5 text-[11px] uppercase tracking-[0.18em] text-[#faf8f5]"
        >
          Sign In
        </Link>
      </main>
    );
  }

  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-5xl px-6 py-10">
          <p className="text-sm text-[#4e4038]">Loading orders...</p>
        </main>
      }
    >
      <OrdersPageContent />
    </Suspense>
  );
}

function OrdersPageContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const paymentSuccess = searchParams.get("paymentSuccess") === "1";
  const successOrderId = searchParams.get("orderId") ?? "";
  const [activeTab, setActiveTab] = useState<OrdersTab>(
    paymentSuccess ? "tracking" : "pending",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState<UserOrder[]>([]);

  useEffect(() => {
    if (status !== "authenticated") {
      setOrders([]);
      return;
    }

    const loadOrders = async () => {
      try {
        setLoading(true);
        setError("");
        const list = await listUserOrders();
        setOrders(list);
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Unable to load orders",
        );
      } finally {
        setLoading(false);
      }
    };

    void loadOrders();
  }, [status]);

  const pendingOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.paymentStatus === "PENDING" || order.paymentStatus === "FAILED",
      ),
    [orders],
  );

  const trackingOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.paymentStatus !== "PENDING" && order.paymentStatus !== "FAILED",
      ),
    [orders],
  );

  const visibleOrders = activeTab === "pending" ? pendingOrders : trackingOrders;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-serif text-3xl text-ink">Orders</h1>
      <p className="mt-2 text-sm text-[#4e4038]">
        Track pending payments and fulfillment updates in one place.
      </p>

      {paymentSuccess ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" aria-hidden="true">
            <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
          </svg>
          <div className="flex-1">
            <p className="font-semibold">Payment successful!</p>
            {successOrderId ? (
              <p className="mt-0.5 text-xs text-emerald-700">
                Order #{successOrderId.slice(-8).toUpperCase()} confirmed. Your saree is on its way.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => router.replace("/orders")}
            className="shrink-0 text-emerald-600 hover:text-emerald-800"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-1 rounded border border-[#e4d9d0] bg-[#faf8f5] p-1.5">
        <button
          type="button"
          onClick={() => setActiveTab("pending")}
          className={`rounded-sm px-4 py-2 text-[11px] uppercase tracking-[0.14em] transition ${
            activeTab === "pending"
              ? "bg-ink text-[#faf8f5]"
              : "text-[#5c4e44] hover:bg-[#f0ebe4]"
          }`}
        >
          Pending Payment ({pendingOrders.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("tracking")}
          className={`rounded-sm px-4 py-2 text-[11px] uppercase tracking-[0.14em] transition ${
            activeTab === "tracking"
              ? "bg-ink text-[#faf8f5]"
              : "text-[#5c4e44] hover:bg-[#f0ebe4]"
          }`}
        >
          Orders and Tracking ({trackingOrders.length})
        </button>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-[#e4d8ca] bg-[#fff7ed] px-3 py-2 text-sm text-[#4e4038]">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-[#4e4038]">Loading orders...</p>
      ) : null}

      {!loading && visibleOrders.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[#d8cab8] bg-[#f8f2ea] p-6 text-sm text-[#4e4038]">
          {activeTab === "pending"
            ? "No pending orders right now."
            : "No paid/tracked orders yet."}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {visibleOrders.map((order) => (
          <details
            key={order.id}
            className="rounded-2xl border border-[#e4d8ca] bg-white p-4"
          >
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-[#4e4038]">
                    Order #{order.id.slice(-8).toUpperCase()}
                  </p>
                  <p className="mt-1 text-sm text-[#4f473f]">
                    {order.items.length} item(s) | Placed on {formatDate(order.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${paymentBadgeClasses(order.paymentStatus)}`}
                  >
                    {toLabel(order.paymentStatus)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${fulfillmentBadgeClasses(order.fulfillmentStatus)}`}
                  >
                    {toLabel(order.fulfillmentStatus)}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-sm font-semibold text-ink">
                Rs {(order.amountInPaise / 100).toLocaleString("en-IN")}
              </p>
            </summary>

            <div className="mt-4 space-y-4 border-t border-[#efe3d6] pt-4">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-[#4e4038]">
                  Items
                </p>
                <ul className="mt-2 space-y-2">
                  {order.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 text-sm text-[#4f473f]"
                    >
                      <span>
                        {item.productName}
                        {item.colorName ? ` (${item.colorName})` : ""} x {item.quantity}
                      </span>
                      <span>
                        Rs {((item.priceAtTime * item.quantity) / 100).toLocaleString("en-IN")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid gap-3 text-sm text-[#4f473f] sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-[#4e4038]">
                    Delivery Address
                  </p>
                  <p className="mt-1">
                    {order.deliveryAddress?.fullName ?? order.customerName}
                    <br />
                    {order.deliveryAddress?.line1 ?? "Address not captured"}
                    {order.deliveryAddress?.city
                      ? `, ${order.deliveryAddress.city}`
                      : ""}
                    {order.deliveryAddress?.postalCode
                      ? ` - ${order.deliveryAddress.postalCode}`
                      : ""}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-[#4e4038]">
                    Shipment
                  </p>
                  <p className="mt-1">
                    Courier: {order.shipment?.courier ?? "Pending"}
                    <br />
                    Tracking: {order.shipment?.trackingNumber ?? "Will be updated"}
                    <br />
                    Expected: {order.shipment?.expectedDeliveryAt
                      ? formatDate(order.shipment.expectedDeliveryAt)
                      : "Will be updated"}
                  </p>
                  {order.shipment?.trackingUrl ? (
                    <a
                      href={order.shipment.trackingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs font-semibold uppercase tracking-[0.1em] text-wine"
                    >
                      Open Tracking Link
                    </a>
                  ) : null}
                </div>
              </div>

              {activeTab === "pending" ? (
                <Link
                  href="/checkout"
                  className="inline-block rounded-sm border border-[#e4d9d0] px-5 py-2.5 text-[11px] uppercase tracking-[0.18em] text-[#5c4e44]"
                >
                  Retry Payment from Checkout
                </Link>
              ) : null}
            </div>
          </details>
        ))}
      </div>

      <p className="mt-6 text-xs text-[#5c4a42]">
        Signed in as {session?.user?.name ?? "Customer"} ({session?.user?.mobile ?? "-"})
      </p>
    </main>
  );
}
