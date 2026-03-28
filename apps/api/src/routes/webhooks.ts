import { createHmac, timingSafeEqual } from "crypto";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();

router.post("/razorpay", async (req, res) => {
  const signature = req.header("x-razorpay-signature") ?? "";
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";

  const rawBodyBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
  const rawBody = rawBodyBuffer.toString("utf8");
  const expectedSignature = createHmac("sha256", secret).update(rawBody).digest("hex");

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
    return res.status(400).json({ message: "Invalid webhook signature" });
  }

  let event: {
    event: string;
    payload?: {
      payment?: { entity?: { id: string; order_id: string } };
      order?: { entity?: { id: string } };
    };
  };

  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ message: "Malformed webhook payload" });
  }

  if (event.event === "payment.captured" || event.event === "order.paid") {
    const razorpayOrderId = event.payload?.payment?.entity?.order_id ?? event.payload?.order?.entity?.id;
    const razorpayPaymentId = event.payload?.payment?.entity?.id;

    if (razorpayOrderId) {
      await prisma.order.updateMany({
        where: { razorpayOrderId },
        data: {
          status: "PAID",
          razorpayPaymentId: razorpayPaymentId ?? undefined
        }
      });
    }
  }

  return res.json({ received: true });
});

export default router;
