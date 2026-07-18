import { prisma } from "./prisma.js";
import { calculateItemGst, getHsnCode } from "./gst.js";
import { allocatePieces } from "./sku.js";
import { generateInvoiceNumber } from "./invoice.js";
import { createShipmentForPaidOrder } from "./courier.js";

type PaidResult = {
  orderId: string | null;
  transitionedToPaid: boolean;
};

type FailedResult = {
  orderId: string | null;
  transitionedToFailure: boolean;
};

export async function markOrderAsPaidByRazorpayOrderId(input: {
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
}): Promise<PaidResult> {
  const normalizedOrderId = input.razorpayOrderId.trim();
  const normalizedPaymentId =
    typeof input.razorpayPaymentId === "string" && input.razorpayPaymentId.trim()
      ? input.razorpayPaymentId.trim()
      : null;
  const normalizedSignature =
    typeof input.razorpaySignature === "string" && input.razorpaySignature.trim()
      ? input.razorpaySignature.trim()
      : null;

  if (!normalizedOrderId) {
    return {
      orderId: null,
      transitionedToPaid: false
    };
  }

  const paidResult = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { razorpayOrderId: normalizedOrderId },
      include: {
        items: {
          select: {
            id: true,
            productId: true,
            productColorId: true,
            quantity: true,
            priceAtTime: true,
            product: {
              select: { fabric: true }
            }
          }
        }
      }
    });

    if (!order) {
      return {
        orderId: null,
        transitionedToPaid: false
      };
    }

    const paymentFields = {
      ...(normalizedPaymentId ? { razorpayPaymentId: normalizedPaymentId } : {}),
      ...(normalizedSignature ? { razorpaySignature: normalizedSignature } : {})
    };

    if (order.status === "PAID") {
      if (Object.keys(paymentFields).length > 0) {
        await tx.order.update({
          where: { id: order.id },
          data: paymentFields
        });
      }

      return {
        orderId: order.id,
        transitionedToPaid: false
      };
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "PAID",
        ...paymentFields
      }
    });

    // ── Generate invoice number ─────────────────────────────────────────────
    const invoiceNumber = await generateInvoiceNumber(tx);
    const invoiceDate = new Date();

    // ── Per-item GST calculation + piece allocation ─────────────────────────
    const deliveryState = order.deliveryState ?? "Unknown";
    let orderTaxable = 0;
    let orderCgst = 0;
    let orderSgst = 0;
    let orderIgst = 0;

    for (const item of order.items) {
      const lineTotal = item.priceAtTime * item.quantity;
      const hsnCode = getHsnCode(item.product.fabric);

      const gst = calculateItemGst({
        lineTotalInPaise: lineTotal,
        deliveryState
      });

      await tx.orderItem.update({
        where: { id: item.id },
        data: {
          hsnCode,
          gstRatePercent: gst.gstRatePercent,
          taxableAmountInPaise: gst.taxableAmountInPaise,
          cgstInPaise: gst.cgstInPaise,
          sgstInPaise: gst.sgstInPaise,
          igstInPaise: gst.igstInPaise
        }
      });

      orderTaxable += gst.taxableAmountInPaise;
      orderCgst += gst.cgstInPaise;
      orderSgst += gst.sgstInPaise;
      orderIgst += gst.igstInPaise;

      // Allocate physical pieces to this order item.
      if (item.productColorId) {
        await allocatePieces(tx, item.productColorId, item.id, item.quantity);
      }
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        invoiceNumber,
        invoiceDate,
        taxableAmountInPaise: orderTaxable,
        cgstInPaise: orderCgst,
        sgstInPaise: orderSgst,
        igstInPaise: orderIgst
      }
    });

    const quantityByVariantKey = new Map<string, { productId: string; productColorId: string; quantity: number }>();

    for (const item of order.items) {
      if (!item.productColorId || item.quantity <= 0) {
        continue;
      }

      const key = `${item.productId}::${item.productColorId}`;
      const previous = quantityByVariantKey.get(key);
      if (!previous) {
        quantityByVariantKey.set(key, {
          productId: item.productId,
          productColorId: item.productColorId,
          quantity: item.quantity
        });
        continue;
      }

      quantityByVariantKey.set(key, {
        ...previous,
        quantity: previous.quantity + item.quantity
      });
    }

    const touchedProductIds = new Set<string>();

    for (const variant of quantityByVariantKey.values()) {
      const color = await tx.productColor.findFirst({
        where: {
          id: variant.productColorId,
          productId: variant.productId,
          isActive: true
        },
        select: {
          id: true,
          productId: true,
          stockQuantity: true
        }
      });

      if (!color) {
        continue;
      }

      const nextQuantity = Math.max(0, color.stockQuantity - variant.quantity);
      if (nextQuantity !== color.stockQuantity) {
        await tx.productColor.update({
          where: { id: color.id },
          data: { stockQuantity: nextQuantity }
        });
      }

      touchedProductIds.add(color.productId);
    }

    for (const productId of touchedProductIds) {
      const inStockColorCount = await tx.productColor.count({
        where: {
          productId,
          isActive: true,
          stockQuantity: { gt: 0 }
        }
      });

      await tx.product.update({
        where: { id: productId },
        data: {
          stockStatus: inStockColorCount > 0 ? "IN_STOCK" : "SOLD_OUT"
        }
      });
    }

    return {
      orderId: order.id,
      transitionedToPaid: true
    };
  });

  if (paidResult.orderId && paidResult.transitionedToPaid) {
    try {
      await createShipmentForPaidOrder(paidResult.orderId);
    } catch (error) {
      console.error("Shipment booking failed after payment", error);
    }
  }

  return paidResult;
}

export async function markOrderAsFailedByRazorpayOrderId(input: {
  razorpayOrderId: string;
  status?: "FAILED" | "CANCELLED";
  razorpayPaymentId?: string;
}): Promise<FailedResult> {
  const normalizedOrderId = input.razorpayOrderId.trim();
  const normalizedPaymentId =
    typeof input.razorpayPaymentId === "string" && input.razorpayPaymentId.trim()
      ? input.razorpayPaymentId.trim()
      : null;
  const targetStatus = input.status === "CANCELLED" ? "CANCELLED" : "FAILED";

  if (!normalizedOrderId) {
    return {
      orderId: null,
      transitionedToFailure: false,
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { razorpayOrderId: normalizedOrderId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!order) {
      return {
        orderId: null,
        transitionedToFailure: false,
      };
    }

    // Never downgrade a successfully paid order.
    if (order.status === "PAID") {
      return {
        orderId: order.id,
        transitionedToFailure: false,
      };
    }

    const paymentFields = normalizedPaymentId
      ? { razorpayPaymentId: normalizedPaymentId }
      : {};

    if (order.status === targetStatus) {
      if (Object.keys(paymentFields).length > 0) {
        await tx.order.update({
          where: { id: order.id },
          data: paymentFields,
        });
      }

      return {
        orderId: order.id,
        transitionedToFailure: false,
      };
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: targetStatus,
        ...paymentFields,
      },
    });

    return {
      orderId: order.id,
      transitionedToFailure: true,
    };
  });

  return result;
}
