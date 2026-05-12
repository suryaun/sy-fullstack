import { createHash, randomInt } from "crypto";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();

function normalizeMobile(input: string) {
  const digits = input.replace(/\D/g, "");
  return digits;
}

function hashOtp(mobile: string, otp: string) {
  return createHash("sha256").update(`${mobile}:${otp}:${process.env.JWT_SECRET ?? ""}`).digest("hex");
}

function asTrimmedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asDateOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function asFulfillmentStatus(notes: Record<string, unknown> | null, orderStatus: "PENDING" | "PAID" | "FAILED" | "CANCELLED") {
  if (notes) {
    const raw = notes.fulfillmentStatus;
    if (typeof raw === "string" && raw.trim()) {
      return raw.trim().toUpperCase();
    }
  }

  if (orderStatus === "PAID") {
    return "PROCESSING";
  }

  if (orderStatus === "CANCELLED") {
    return "CANCELLED";
  }

  return null;
}

function mapOrderForResponse(order: {
  id: string;
  status: "PENDING" | "PAID" | "FAILED" | "CANCELLED";
  amountInPaise: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes: unknown;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    productId: string;
    productColorId: string | null;
    colorNameAtTime: string | null;
    quantity: number;
    priceAtTime: number;
    product: {
      id: string;
      name: string;
      imageUrl: string;
    };
    productColor: {
      id: string;
      name: string;
    } | null;
  }>;
}) {
  const notes = asRecord(order.notes);
  const deliveryAddress = asRecord(notes?.deliveryAddress);
  const shipment = asRecord(notes?.shipment);

  return {
    id: order.id,
    paymentStatus: order.status,
    fulfillmentStatus: asFulfillmentStatus(notes, order.status),
    amountInPaise: order.amountInPaise,
    currency: order.currency,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productColorId: item.productColorId,
      colorName: item.colorNameAtTime ?? item.productColor?.name ?? null,
      quantity: item.quantity,
      priceAtTime: item.priceAtTime,
      productName: item.product.name,
      productImageUrl: item.product.imageUrl
    })),
    deliveryAddress: deliveryAddress
      ? {
          fullName: asTrimmedText(deliveryAddress.fullName) || null,
          phoneNumber: asTrimmedText(deliveryAddress.phoneNumber) || null,
          line1: asTrimmedText(deliveryAddress.line1) || null,
          line2: asTrimmedText(deliveryAddress.line2) || null,
          landmark: asTrimmedText(deliveryAddress.landmark) || null,
          city: asTrimmedText(deliveryAddress.city) || null,
          state: asTrimmedText(deliveryAddress.state) || null,
          postalCode: asTrimmedText(deliveryAddress.postalCode) || null,
          country: asTrimmedText(deliveryAddress.country) || null
        }
      : null,
    shipment: shipment
      ? {
          courier: asTrimmedText(shipment.courier) || null,
          trackingNumber: asTrimmedText(shipment.trackingNumber) || null,
          trackingUrl: asTrimmedText(shipment.trackingUrl) || null,
          expectedDeliveryAt: asDateOrNull(shipment.expectedDeliveryAt)
        }
      : null
  };
}

function mapAddressForResponse(address: {
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
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: address.id,
    customerId: address.customerId,
    fullName: address.fullName,
    phoneNumber: address.phoneNumber,
    line1: address.line1,
    line2: address.line2,
    landmark: address.landmark,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
    addressType: address.addressType,
    isDefault: address.isDefault,
    createdAt: address.createdAt,
    updatedAt: address.updatedAt
  };
}

router.post("/request-otp", async (req, res) => {
  const mobileRaw = String(req.body?.mobile ?? "");
  const mobile = normalizeMobile(mobileRaw);

  if (mobile.length < 10 || mobile.length > 15) {
    return res.status(400).json({ message: "Invalid mobile number" });
  }

  const otp = String(randomInt(100000, 999999));
  const expiresInMinutes = Number(process.env.MOBILE_OTP_EXPIRY_MINUTES ?? 5);
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  const existingUser = await prisma.customerUser.findUnique({ where: { mobile } });

  await prisma.mobileOtp.create({
    data: {
      mobile,
      codeHash: hashOtp(mobile, otp),
      expiresAt,
      customerId: existingUser?.id
    }
  });

  return res.json({
    success: true,
    isRegistered: Boolean(existingUser),
    expiresInSeconds: expiresInMinutes * 60,
    devOtp: otp
  });
});

router.post("/verify-otp", async (req, res) => {
  const mobileRaw = String(req.body?.mobile ?? "");
  const otp = String(req.body?.otp ?? "").trim();
  const providedName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const providedEmail = typeof req.body?.email === "string" ? req.body.email.trim() : "";

  const mobile = normalizeMobile(mobileRaw);

  if (mobile.length < 10 || mobile.length > 15 || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({ message: "Invalid mobile or OTP format" });
  }

  const otpRecord = await prisma.mobileOtp.findFirst({
    where: {
      mobile,
      usedAt: null,
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: "desc" }
  });

  if (!otpRecord || otpRecord.codeHash !== hashOtp(mobile, otp)) {
    return res.status(400).json({ message: "Incorrect or expired OTP" });
  }

  await prisma.mobileOtp.update({
    where: { id: otpRecord.id },
    data: { usedAt: new Date() }
  });

  let user = await prisma.customerUser.findUnique({ where: { mobile } });

  if (!user) {
    user = await prisma.customerUser.create({
      data: {
        mobile,
        fullName: providedName || null,
        email: providedEmail || null,
        profileComplete: Boolean(providedName && providedEmail)
      }
    });
  }

  return res.json({
    user: {
      id: user.id,
      mobile: user.mobile,
      name: user.fullName,
      email: user.email,
      profileComplete: user.profileComplete
    }
  });
});

router.patch("/profile", async (req, res) => {
  const userId = String(req.body?.userId ?? "");
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";

  if (!userId || !name || !email) {
    return res.status(400).json({ message: "userId, name and email are required" });
  }

  const user = await prisma.customerUser.update({
    where: { id: userId },
    data: {
      fullName: name,
      email,
      profileComplete: true
    }
  });

  return res.json({
    user: {
      id: user.id,
      mobile: user.mobile,
      name: user.fullName,
      email: user.email,
      profileComplete: user.profileComplete
    }
  });
});

router.get("/addresses", async (req, res) => {
  const userId = asTrimmedText(req.query?.userId);

  if (!userId) {
    return res.status(400).json({ message: "userId is required" });
  }

  const user = await prisma.customerUser.findUnique({
    where: { id: userId },
    select: { id: true }
  });

  if (!user) {
    return res.status(404).json({ message: "Customer not found" });
  }

  const addresses = await prisma.customerAddress.findMany({
    where: { customerId: userId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }]
  });

  return res.json({
    addresses: addresses.map(mapAddressForResponse)
  });
});

router.post("/addresses", async (req, res) => {
  const userId = asTrimmedText(req.body?.userId);
  const fullName = asTrimmedText(req.body?.fullName);
  const phoneNumber = normalizeMobile(asTrimmedText(req.body?.phoneNumber));
  const line1 = asTrimmedText(req.body?.line1);
  const line2 = asTrimmedText(req.body?.line2);
  const landmark = asTrimmedText(req.body?.landmark);
  const city = asTrimmedText(req.body?.city);
  const state = asTrimmedText(req.body?.state);
  const postalCode = asTrimmedText(req.body?.postalCode);
  const country = asTrimmedText(req.body?.country) || "India";
  const addressType = asTrimmedText(req.body?.addressType);
  const wantsDefault = Boolean(req.body?.isDefault);

  if (!userId) {
    return res.status(400).json({ message: "userId is required" });
  }

  if (!fullName || !line1 || !city || !state || !postalCode) {
    return res.status(400).json({
      message: "fullName, line1, city, state and postalCode are required"
    });
  }

  if (phoneNumber.length < 10 || phoneNumber.length > 15) {
    return res.status(400).json({ message: "Invalid phone number" });
  }

  const user = await prisma.customerUser.findUnique({
    where: { id: userId },
    select: { id: true }
  });

  if (!user) {
    return res.status(404).json({ message: "Customer not found" });
  }

  const existingCount = await prisma.customerAddress.count({ where: { customerId: userId } });
  const shouldSetDefault = wantsDefault || existingCount === 0;

  const created = await prisma.$transaction(async (tx) => {
    if (shouldSetDefault) {
      await tx.customerAddress.updateMany({
        where: { customerId: userId, isDefault: true },
        data: { isDefault: false }
      });
    }

    return tx.customerAddress.create({
      data: {
        customerId: userId,
        fullName,
        phoneNumber,
        line1,
        line2: line2 || null,
        landmark: landmark || null,
        city,
        state,
        postalCode,
        country,
        addressType: addressType || null,
        isDefault: shouldSetDefault
      }
    });
  });

  return res.status(201).json({ address: mapAddressForResponse(created) });
});

router.patch("/addresses/:addressId", async (req, res) => {
  const userId = asTrimmedText(req.body?.userId);
  const addressId = asTrimmedText(req.params?.addressId);

  if (!userId || !addressId) {
    return res.status(400).json({ message: "userId and addressId are required" });
  }

  const existing = await prisma.customerAddress.findUnique({
    where: { id: addressId }
  });

  if (!existing || existing.customerId !== userId) {
    return res.status(404).json({ message: "Address not found" });
  }

  const fullName = asTrimmedText(req.body?.fullName);
  const line1 = asTrimmedText(req.body?.line1);
  const city = asTrimmedText(req.body?.city);
  const state = asTrimmedText(req.body?.state);
  const postalCode = asTrimmedText(req.body?.postalCode);

  if (!fullName || !line1 || !city || !state || !postalCode) {
    return res.status(400).json({
      message: "fullName, line1, city, state and postalCode are required"
    });
  }

  const phoneNumber = normalizeMobile(asTrimmedText(req.body?.phoneNumber));
  if (phoneNumber.length < 10 || phoneNumber.length > 15) {
    return res.status(400).json({ message: "Invalid phone number" });
  }

  const line2 = asTrimmedText(req.body?.line2);
  const landmark = asTrimmedText(req.body?.landmark);
  const country = asTrimmedText(req.body?.country) || "India";
  const addressType = asTrimmedText(req.body?.addressType);
  const setAsDefault = req.body?.isDefault === true;

  const updated = await prisma.$transaction(async (tx) => {
    if (setAsDefault) {
      await tx.customerAddress.updateMany({
        where: { customerId: userId, isDefault: true },
        data: { isDefault: false }
      });
    }

    return tx.customerAddress.update({
      where: { id: addressId },
      data: {
        fullName,
        phoneNumber,
        line1,
        line2: line2 || null,
        landmark: landmark || null,
        city,
        state,
        postalCode,
        country,
        addressType: addressType || null,
        ...(setAsDefault ? { isDefault: true } : {})
      }
    });
  });

  return res.json({ address: mapAddressForResponse(updated) });
});

router.patch("/addresses/:addressId/default", async (req, res) => {
  const userId = asTrimmedText(req.body?.userId);
  const addressId = asTrimmedText(req.params?.addressId);

  if (!userId || !addressId) {
    return res.status(400).json({ message: "userId and addressId are required" });
  }

  const existing = await prisma.customerAddress.findUnique({
    where: { id: addressId },
    select: {
      id: true,
      customerId: true
    }
  });

  if (!existing || existing.customerId !== userId) {
    return res.status(404).json({ message: "Address not found" });
  }

  await prisma.$transaction(async (tx) => {
    await tx.customerAddress.updateMany({
      where: { customerId: userId, isDefault: true },
      data: { isDefault: false }
    });

    await tx.customerAddress.update({
      where: { id: addressId },
      data: { isDefault: true }
    });
  });

  const addresses = await prisma.customerAddress.findMany({
    where: { customerId: userId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }]
  });

  return res.json({
    addresses: addresses.map(mapAddressForResponse)
  });
});

router.get("/orders", async (req, res) => {
  const userId = asTrimmedText(req.query?.userId);

  if (!userId) {
    return res.status(400).json({ message: "userId is required" });
  }

  const user = await prisma.customerUser.findUnique({
    where: { id: userId },
    select: {
      id: true,
      mobile: true,
      email: true
    }
  });

  if (!user) {
    return res.status(404).json({ message: "Customer not found" });
  }

  const orderLookupFilters: Array<Record<string, unknown>> = [
    { notes: { path: ["customerUserId"], equals: userId } },
    { customerPhone: user.mobile }
  ];

  if (user.email) {
    orderLookupFilters.push({ customerEmail: user.email });
  }

  const orders = await prisma.order.findMany({
    where: {
      OR: orderLookupFilters
    },
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              imageUrl: true
            }
          },
          productColor: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    }
  });

  return res.json({
    orders: orders.map(mapOrderForResponse)
  });
});

router.delete("/addresses/:addressId", async (req, res) => {
  const userId = asTrimmedText(req.body?.userId);
  const addressId = asTrimmedText(req.params?.addressId);

  if (!userId || !addressId) {
    return res.status(400).json({ message: "userId and addressId are required" });
  }

  const existing = await prisma.customerAddress.findUnique({
    where: { id: addressId },
    select: {
      id: true,
      customerId: true
    }
  });

  if (!existing || existing.customerId !== userId) {
    return res.status(404).json({ message: "Address not found" });
  }

  await prisma.$transaction(async (tx) => {
    await tx.customerAddress.delete({
      where: { id: addressId }
    });

    const remaining = await tx.customerAddress.findMany({
      where: { customerId: userId },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        isDefault: true
      }
    });

    const hasDefault = remaining.some((address) => address.isDefault);
    if (!hasDefault && remaining.length > 0) {
      await tx.customerAddress.update({
        where: { id: remaining[0].id },
        data: { isDefault: true }
      });
    }
  });

  const addresses = await prisma.customerAddress.findMany({
    where: { customerId: userId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }]
  });

  return res.json({
    addresses: addresses.map(mapAddressForResponse)
  });
});

export default router;
