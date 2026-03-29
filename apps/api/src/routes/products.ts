import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();

function asSingle(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

router.get("/", async (_req, res) => {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      images: {
        orderBy: { sortOrder: "asc" },
        select: {
          imageUrl: true,
          sortOrder: true
        }
      }
    }
  });

  return res.json(products);
});

router.get("/:id", async (req, res) => {
  const productId = asSingle(req.params.id);
  if (!productId) {
    return res.status(400).json({ message: "Product id is required" });
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      images: {
        orderBy: { sortOrder: "asc" }
      },
      colors: {
        where: { isActive: true },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        include: {
          images: { orderBy: { sortOrder: "asc" } }
        }
      }
    }
  });

  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  const defaultColor = product.colors.find((color) => color.isDefault) ?? product.colors[0] ?? null;

  return res.json({
    ...product,
    defaultColorId: defaultColor?.id ?? null
  });
});

router.get("/:id/notify-me-status", async (req, res) => {
  const productId = asSingle(req.params.id);
  const customerId = asSingle(req.query.customerId as string | string[] | undefined);

  if (!productId || !customerId) {
    return res.status(400).json({ message: "productId and customerId are required" });
  }

  const requests = await prisma.backInStockRequest.findMany({
    where: {
      productId,
      customerId
    },
    select: {
      productColorId: true,
      status: true
    }
  });

  return res.json({
    requestedColorIds: requests.map((request) => request.productColorId),
    statuses: requests
  });
});

router.post("/:id/notify-me", async (req, res) => {
  const productId = asSingle(req.params.id);
  const { customerId, productColorId } = req.body as { customerId?: string; productColorId?: string };

  if (!productId || !customerId || !productColorId) {
    return res.status(400).json({ message: "productId, customerId and productColorId are required" });
  }

  const color = await prisma.productColor.findFirst({
    where: {
      id: productColorId,
      productId,
      isActive: true
    }
  });

  if (!color) {
    return res.status(404).json({ message: "Color variant not found" });
  }

  if (color.stockQuantity > 0) {
    return res.status(400).json({ message: "Selected color is already in stock" });
  }

  try {
    const request = await prisma.backInStockRequest.create({
      data: {
        customerId,
        productId,
        productColorId,
        status: "ACTIVE"
      }
    });

    return res.status(201).json({ success: true, requestId: request.id });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ message: "Notify request already exists for this item and color" });
    }

    throw error;
  }
});

export default router;
