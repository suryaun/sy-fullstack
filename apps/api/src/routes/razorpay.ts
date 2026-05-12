import { createHmac } from "crypto";
import { Router } from "express";
import { markOrderAsPaidByRazorpayOrderId } from "../lib/orderPayment.js";
import { prisma } from "../lib/prisma.js";
import { razorpay } from "../lib/razorpay.js";

const router = Router();

/** How long a stock reservation is held while the user is in the payment modal. */
const RESERVATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

type CheckoutItem = {
  productId: string;
  productColorId: string;
  quantity: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /order
// Validates items, acquires / renews stock reservations (blocks other
// customers), creates the internal Order and the Razorpay order.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/order", async (req, res) => {
  try {
    const {
      customerName,
      customerEmail,
      customerPhone,
      customerUserId,
      deliveryAddressId,
      items,
    } = req.body as {
      customerName: string;
      customerEmail: string;
      customerPhone: string;
      customerUserId?: string;
      deliveryAddressId?: string;
      items: CheckoutItem[];
    };

    const normalizedCustomerUserId =
      typeof customerUserId === "string" && customerUserId.trim()
        ? customerUserId.trim()
        : null;
    const normalizedDeliveryAddressId =
      typeof deliveryAddressId === "string" && deliveryAddressId.trim()
        ? deliveryAddressId.trim()
        : null;

    if (!normalizedCustomerUserId) {
      return res.status(401).json({ message: "Authentication required to place an order" });
    }

    const normalizedItems = Array.isArray(items)
      ? items
          .map((item) => ({
            productId: typeof item?.productId === "string" ? item.productId.trim() : "",
            productColorId:
              typeof item?.productColorId === "string" ? item.productColorId.trim() : "",
            quantity: Number.isFinite(item?.quantity) ? Math.floor(item.quantity) : 0,
          }))
          .filter(
            (item) =>
              item.productId.length > 0 &&
              item.productColorId.length > 0 &&
              item.quantity > 0,
          )
      : [];

    if (!normalizedItems.length) {
      return res.status(400).json({ message: "At least one item is required" });
    }

    // Deduplicate by (productId, productColorId)
    const consolidatedItems = Array.from(
      normalizedItems
        .reduce((acc, item) => {
          const key = `${item.productId}::${item.productColorId}`;
          const existing = acc.get(key);
          if (existing) {
            acc.set(key, { ...existing, quantity: existing.quantity + item.quantity });
          } else {
            acc.set(key, item);
          }
          return acc;
        }, new Map<string, CheckoutItem>())
        .values(),
    );

    // ── Validate delivery address ─────────────────────────────────────────────
    let selectedAddress: {
      id: string;
      customerId: string;
      fullName: string;
      phoneNumber: string;
      line1: string;
      line2: string | null;
      landmark: string | null;
      city: string;
      state: string;
      postalCode: string;
      country: string;
      addressType: string | null;
    } | null = null;

    if (normalizedDeliveryAddressId) {
      selectedAddress = await prisma.customerAddress.findFirst({
        where: {
          id: normalizedDeliveryAddressId,
          customerId: normalizedCustomerUserId,
        },
        select: {
          id: true,
          customerId: true,
          fullName: true,
          phoneNumber: true,
          line1: true,
          line2: true,
          landmark: true,
          city: true,
          state: true,
          postalCode: true,
          country: true,
          addressType: true,
        },
      });
      if (!selectedAddress) {
        return res.status(400).json({ message: "Selected delivery address is invalid" });
      }
    }

    const requestedColorIds = [...new Set(consolidatedItems.map((i) => i.productColorId))];
    const requestedProductIds = [...new Set(consolidatedItems.map((i) => i.productId))];

    // ── Serialisable transaction: stock check + reserve ───────────────────────
    const txResult = await prisma.$transaction(
      async (tx) => {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS);

        // Fetch live product / color data
        const products = await tx.product.findMany({
          where: { id: { in: requestedProductIds } },
          select: {
            id: true,
            name: true,
            priceInPaise: true,
            stockStatus: true,
            colors: {
              where: { id: { in: requestedColorIds }, isActive: true },
              select: { id: true, name: true, stockQuantity: true, priceInPaise: true },
            },
          },
        });
        const productsById = new Map(products.map((p) => [p.id, p]));

        // How much stock is already held by OTHER customers (not expired)?
        const conflictingReservations = await tx.stockReservation.findMany({
          where: {
            productColorId: { in: requestedColorIds },
            customerId: { not: normalizedCustomerUserId },
            expiresAt: { gt: now },
          },
          select: { productColorId: true, quantity: true },
        });
        const reservedByOthers = new Map<string, number>();
        for (const r of conflictingReservations) {
          reservedByOthers.set(
            r.productColorId,
            (reservedByOthers.get(r.productColorId) ?? 0) + r.quantity,
          );
        }

        // Validate each line item
        const unavailableItems: Array<{
          productId: string;
          productName: string | null;
          productColorId: string;
          colorName: string | null;
          reason: string;
          requestedQuantity: number;
          availableQuantity: number;
        }> = [];

        for (const item of consolidatedItems) {
          const product = productsById.get(item.productId);
          if (!product) {
            unavailableItems.push({ productId: item.productId, productName: null, productColorId: item.productColorId, colorName: null, reason: "MISSING_PRODUCT", requestedQuantity: item.quantity, availableQuantity: 0 });
            continue;
          }
          const color = product.colors.find((c) => c.id === item.productColorId);
          if (!color) {
            unavailableItems.push({ productId: item.productId, productName: product.name, productColorId: item.productColorId, colorName: null, reason: "MISSING_COLOR", requestedQuantity: item.quantity, availableQuantity: 0 });
            continue;
          }
          if (color.stockQuantity <= 0 || product.stockStatus !== "IN_STOCK") {
            unavailableItems.push({ productId: item.productId, productName: product.name, productColorId: item.productColorId, colorName: color.name, reason: "OUT_OF_STOCK", requestedQuantity: item.quantity, availableQuantity: 0 });
            continue;
          }
          const othersHeld = reservedByOthers.get(item.productColorId) ?? 0;
          const available = color.stockQuantity - othersHeld;
          if (item.quantity > available) {
            unavailableItems.push({
              productId: item.productId,
              productName: product.name,
              productColorId: item.productColorId,
              colorName: color.name,
              reason: available <= 0 ? "OUT_OF_STOCK" : "INSUFFICIENT_STOCK",
              requestedQuantity: item.quantity,
              availableQuantity: Math.max(0, available),
            });
          }
        }

        if (unavailableItems.length > 0) {
          return { type: "UNAVAILABLE" as const, unavailableItems };
        }

        // Upsert reservations for this customer (one row per color variant)
        for (const item of consolidatedItems) {
          const existing = await tx.stockReservation.findFirst({
            where: {
              customerId: normalizedCustomerUserId,
              productColorId: item.productColorId,
            },
            select: { id: true },
          });
          if (existing) {
            await tx.stockReservation.update({
              where: { id: existing.id },
              data: { quantity: item.quantity, expiresAt, razorpayOrderId: null },
            });
          } else {
            await tx.stockReservation.create({
              data: {
                customerId: normalizedCustomerUserId,
                productColorId: item.productColorId,
                quantity: item.quantity,
                expiresAt,
              },
            });
          }
        }

        // Calculate total
        const amountInPaise = consolidatedItems.reduce((total, item) => {
          const product = productsById.get(item.productId)!;
          const color = product.colors.find((c) => c.id === item.productColorId)!;
          return total + (color.priceInPaise ?? product.priceInPaise) * item.quantity;
        }, 0);

        if (amountInPaise <= 0) {
          return { type: "BAD_AMOUNT" as const };
        }

        // Create the internal Order record
        const order = await tx.order.create({
          data: {
            amountInPaise,
            customerName,
            customerEmail,
            customerPhone,
            deliveryState: selectedAddress?.state ?? null,
            deliveryAddressSnapshot: selectedAddress ?? undefined,
            notes: {
              customerUserId: normalizedCustomerUserId,
              ...(selectedAddress ? { deliveryAddress: selectedAddress } : {}),
            },
            items: {
              create: consolidatedItems.map((item) => {
                const product = productsById.get(item.productId)!;
                const color = product.colors.find((c) => c.id === item.productColorId)!;
                return {
                  productId: item.productId,
                  productColorId: item.productColorId,
                  colorNameAtTime: color.name ?? null,
                  quantity: item.quantity,
                  priceAtTime: color.priceInPaise ?? product.priceInPaise,
                };
              }),
            },
          },
          select: { id: true, amountInPaise: true },
        });

        return { type: "OK" as const, order, amountInPaise };
      },
      { isolationLevel: "Serializable" },
    );

    if (txResult.type === "UNAVAILABLE") {
      return res.status(409).json({
        message: "One or more items are unavailable or temporarily reserved by another customer",
        unavailableItems: txResult.unavailableItems,
      });
    }

    if (txResult.type === "BAD_AMOUNT") {
      return res.status(400).json({ message: "Order amount must be greater than zero" });
    }

    const { order, amountInPaise } = txResult;

    // ── Create Razorpay order (external call — outside DB tx) ─────────────────
    let razorpayOrder: Awaited<ReturnType<typeof razorpay.orders.create>>;
    try {
      razorpayOrder = await razorpay.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt: order.id,
        notes: { internalOrderId: order.id },
      });
    } catch (rzErr) {
      // Release reservations so the customer can retry immediately
      await prisma.stockReservation.deleteMany({
        where: { customerId: normalizedCustomerUserId },
      });
      throw rzErr;
    }

    // Link Razorpay order id back to the internal order and reservations
    await prisma.$transaction([
      prisma.order.update({
        where: { id: order.id },
        data: { razorpayOrderId: razorpayOrder.id },
      }),
      prisma.stockReservation.updateMany({
        where: { customerId: normalizedCustomerUserId },
        data: { razorpayOrderId: razorpayOrder.id },
      }),
    ]);

    return res.json({
      orderId: order.id,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("POST /razorpay/order error", error);
    return res.status(500).json({ message: "Unable to create order", error: String(error) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /verify
// Called by the client after the Razorpay success handler fires.
// Verifies HMAC signature, marks the Order PAID, commits stock changes,
// and deletes the stock reservations (stock is now permanently allocated).
// ─────────────────────────────────────────────────────────────────────────────
router.post("/verify", async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body as {
      razorpay_order_id: string;
      razorpay_payment_id: string;
      razorpay_signature: string;
    };

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ message: "Missing payment verification fields" });
  }

  // Verify Razorpay HMAC signature
  const signedPayload = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expected = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET ?? "")
    .update(signedPayload)
    .digest("hex");

  if (expected !== razorpay_signature) {
    return res.status(400).json({ message: "Invalid payment signature" });
  }

  const paidResult = await markOrderAsPaidByRazorpayOrderId({
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    razorpaySignature: razorpay_signature,
  });

  if (!paidResult.orderId) {
    return res.status(404).json({ message: "Order not found" });
  }

  // Release reservations — stock is now committed via the order
  await prisma.stockReservation.deleteMany({
    where: { razorpayOrderId: razorpay_order_id },
  });

  return res.json({
    verified: true,
    orderId: paidResult.orderId,
    alreadyPaid: !paidResult.transitionedToPaid,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /release
// Called by the client when the user dismisses the Razorpay modal without
// paying, or when payment.failed fires.  Frees the stock reservation so
// other customers can purchase immediately instead of waiting 10 minutes.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/release", async (req, res) => {
  const { razorpayOrderId, customerUserId } = req.body as {
    razorpayOrderId?: string;
    customerUserId?: string;
  };

  if (!razorpayOrderId && !customerUserId) {
    return res.status(400).json({ message: "razorpayOrderId or customerUserId is required" });
  }

  const where = razorpayOrderId
    ? { razorpayOrderId }
    : { customerId: customerUserId! };

  const { count } = await prisma.stockReservation.deleteMany({ where });
  return res.json({ released: true, count });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /reservations/expired  (cron-friendly cleanup endpoint)
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/reservations/expired", async (_req, res) => {
  const { count } = await prisma.stockReservation.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return res.json({ deleted: count });
});

export default router;
