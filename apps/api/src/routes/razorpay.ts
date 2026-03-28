import { createHmac } from "crypto";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { razorpay } from "../lib/razorpay.js";

const router = Router();

type CheckoutItem = {
  productId: string;
  quantity: number;
};

router.post("/order", async (req, res) => {
  try {
    const { customerName, customerEmail, customerPhone, items } = req.body as {
      customerName: string;
      customerEmail: string;
      customerPhone: string;
      items: CheckoutItem[];
    };

    if (!items?.length) {
      return res.status(400).json({ message: "At least one item is required" });
    }

    const products = await prisma.product.findMany({
      where: {
        id: { in: items.map((item) => item.productId) },
        stockStatus: "IN_STOCK"
      }
    });

    if (products.length !== items.length) {
      return res.status(400).json({ message: "One or more products are unavailable" });
    }

    const amountInPaise = items.reduce((total, item) => {
      const product = products.find((p) => p.id === item.productId);
      return total + (product?.priceInPaise ?? 0) * item.quantity;
    }, 0);

    const order = await prisma.order.create({
      data: {
        amountInPaise,
        customerName,
        customerEmail,
        customerPhone,
        items: {
          create: items.map((item) => {
            const product = products.find((p) => p.id === item.productId);
            return {
              productId: item.productId,
              quantity: item.quantity,
              priceAtTime: product?.priceInPaise ?? 0
            };
          })
        }
      },
      include: { items: true }
    });

    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: order.id,
      notes: {
        internalOrderId: order.id
      }
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { razorpayOrderId: razorpayOrder.id }
    });

    return res.json({
      orderId: order.id,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to create Razorpay order", error });
  }
});

router.post("/verify", async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body as {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  };

  const signedPayload = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expected = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET ?? "")
    .update(signedPayload)
    .digest("hex");

  if (expected !== razorpay_signature) {
    return res.status(400).json({ message: "Invalid Razorpay signature" });
  }

  await prisma.order.updateMany({
    where: { razorpayOrderId: razorpay_order_id },
    data: {
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      status: "PAID"
    }
  });

  return res.json({ verified: true });
});

export default router;
