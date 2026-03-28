import { randomUUID } from "crypto";
import { Router } from "express";
import ImageKit, { toFile } from "@imagekit/nodejs";
import multer from "multer";
import sharp from "sharp";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();
const IMAGE_UPLOAD_MAX_BYTES = Number(process.env.IMAGE_UPLOAD_MAX_BYTES ?? 15 * 1024 * 1024);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: IMAGE_UPLOAD_MAX_BYTES
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image uploads are supported"));
      return;
    }

    cb(null, true);
  }
});

const imagekit = new ImageKit({
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY ?? ""
});

function asSingle(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function syncProductStockStatus(productId: string) {
  const inStockColorCount = await prisma.productColor.count({
    where: {
      productId,
      isActive: true,
      stockQuantity: { gt: 0 }
    }
  });

  const stockStatus = inStockColorCount > 0 ? "IN_STOCK" : "SOLD_OUT";

  await prisma.product.update({
    where: { id: productId },
    data: { stockStatus }
  });
}

router.get("/products", requireAdmin, async (_req, res) => {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      stockStatus: true,
      images: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          imageUrl: true,
          sortOrder: true
        }
      },
      colors: {
        where: { isActive: true },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          stockQuantity: true,
          isDefault: true,
          images: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              imageUrl: true,
              sortOrder: true
            }
          }
        }
      }
    }
  });

  return res.json(products);
});

router.post("/products", requireAdmin, async (req, res) => {
  const {
    name,
    description,
    fabric,
    craft,
    lengthInMeters,
    blouseIncluded,
    priceInPaise,
    imageUrl,
    imagePublicId,
    imageUploads
  } = req.body;

  const uploads = Array.isArray(imageUploads)
    ? (imageUploads as Array<{ imageUrl: string; imagePublicId?: string }>).filter((item) => item?.imageUrl)
    : [];

  const coverImageUrl = uploads[0]?.imageUrl ?? imageUrl;
  const coverImagePublicId = uploads[0]?.imagePublicId ?? imagePublicId;

  if (!coverImageUrl) {
    return res.status(400).json({ message: "At least one product image is required" });
  }

  const createdProduct = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        name,
        description,
        fabric,
        craft,
        lengthInMeters,
        blouseIncluded,
        priceInPaise,
        imageUrl: coverImageUrl,
        imagePublicId: coverImagePublicId
      }
    });

    if (uploads.length > 0) {
      await tx.productImage.createMany({
        data: uploads.map((item, index) => ({
          productId: created.id,
          imageUrl: item.imageUrl,
          imagePublicId: item.imagePublicId ?? null,
          sortOrder: index
        }))
      });
    }

    return created;
  });

  const product = await prisma.product.findUnique({
    where: { id: createdProduct.id },
    select: {
      id: true,
      name: true,
      stockStatus: true,
      images: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          imageUrl: true,
          sortOrder: true
        }
      },
      colors: {
        where: { isActive: true },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          stockQuantity: true,
          isDefault: true,
          images: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              imageUrl: true,
              sortOrder: true
            }
          }
        }
      }
    }
  });

  return res.status(201).json(product);
});

router.post("/products/:id/images", requireAdmin, async (req, res) => {
  const productId = asSingle(req.params.id);
  const imageUploads = (req.body as { imageUploads?: Array<{ imageUrl: string; imagePublicId?: string }> }).imageUploads ?? [];

  if (!productId) {
    return res.status(400).json({ message: "Product id is required" });
  }

  if (!Array.isArray(imageUploads) || imageUploads.length === 0) {
    return res.status(400).json({ message: "imageUploads is required" });
  }

  const maxSort = await prisma.productImage.findFirst({
    where: { productId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true }
  });
  const startSort = (maxSort?.sortOrder ?? -1) + 1;

  await prisma.productImage.createMany({
    data: imageUploads
      .filter((item) => item?.imageUrl)
      .map((item, index) => ({
        productId,
        imageUrl: item.imageUrl,
        imagePublicId: item.imagePublicId ?? null,
        sortOrder: startSort + index
      }))
  });

  return res.json({ success: true });
});

router.patch("/products/:id/images/reorder", requireAdmin, async (req, res) => {
  const productId = asSingle(req.params.id);
  const imageIds = (req.body as { imageIds?: string[] }).imageIds ?? [];

  if (!productId) {
    return res.status(400).json({ message: "Product id is required" });
  }

  if (!Array.isArray(imageIds) || imageIds.length === 0) {
    return res.status(400).json({ message: "imageIds is required" });
  }

  const existing = await prisma.productImage.findMany({
    where: { productId },
    select: { id: true }
  });

  if (existing.length !== imageIds.length) {
    return res.status(400).json({ message: "imageIds must include all product images" });
  }

  const existingSet = new Set(existing.map((item) => item.id));
  const incomingSet = new Set(imageIds);
  if (existingSet.size !== incomingSet.size || [...existingSet].some((id) => !incomingSet.has(id))) {
    return res.status(400).json({ message: "imageIds contains invalid image ids" });
  }

  await prisma.$transaction(async (tx) => {
    for (const [index, imageId] of imageIds.entries()) {
      await tx.productImage.update({
        where: { id: imageId },
        data: { sortOrder: index }
      });
    }

    const firstImage = await tx.productImage.findFirst({
      where: { productId },
      orderBy: { sortOrder: "asc" },
      select: { imageUrl: true, imagePublicId: true }
    });

    if (firstImage) {
      await tx.product.update({
        where: { id: productId },
        data: {
          imageUrl: firstImage.imageUrl,
          imagePublicId: firstImage.imagePublicId
        }
      });
    }
  });

  return res.json({ success: true });
});

router.post("/products/:id/colors", requireAdmin, async (req, res) => {
  const productId = asSingle(req.params.id);
  const {
    name,
    colorCode,
    isDefault,
    stockQuantity,
    priceInPaise,
    imageUrls,
    imageUploads
  } = req.body as {
    name?: string;
    colorCode?: string;
    isDefault?: boolean;
    stockQuantity?: number;
    priceInPaise?: number;
    imageUrls?: string[];
    imageUploads?: Array<{ imageUrl: string; imagePublicId?: string }>;
  };

  if (!productId) {
    return res.status(400).json({ message: "Product id is required" });
  }

  if (!name?.trim()) {
    return res.status(400).json({ message: "Color name is required" });
  }

  const existingColorCount = await prisma.productColor.count({ where: { productId } });
  const shouldBeDefault = isDefault === true || existingColorCount === 0;

  const color = await prisma.$transaction(async (tx) => {
    if (shouldBeDefault) {
      await tx.productColor.updateMany({
        where: { productId },
        data: { isDefault: false }
      });
    }

    const created = await tx.productColor.create({
      data: {
        productId,
        name: name.trim(),
        colorCode: colorCode?.trim() || null,
        isDefault: shouldBeDefault,
        stockQuantity: Math.max(0, Number(stockQuantity ?? 0)),
        priceInPaise: typeof priceInPaise === "number" ? priceInPaise : null
      }
    });

    const normalizedImageUploads: Array<{ imageUrl: string; imagePublicId?: string }> = Array.isArray(imageUploads)
      ? imageUploads.filter((item) => item?.imageUrl)
      : Array.isArray(imageUrls)
        ? imageUrls.map((url) => ({ imageUrl: url }))
        : [];

    if (normalizedImageUploads.length > 0) {
      await tx.productColorImage.createMany({
        data: normalizedImageUploads
          .map((item, index) => ({
            productColorId: created.id,
            imageUrl: item.imageUrl,
            imagePublicId: item.imagePublicId ?? null,
            sortOrder: index
          }))
          .filter((item) => Boolean(item.imageUrl))
      });
    }

    return created;
  });

  await syncProductStockStatus(productId);

  const withImages = await prisma.productColor.findUnique({
    where: { id: color.id },
    include: {
      images: {
        orderBy: { sortOrder: "asc" }
      }
    }
  });

  return res.status(201).json(withImages);
});

router.post("/products/:id/colors/:colorId/images", requireAdmin, async (req, res) => {
  const productId = asSingle(req.params.id);
  const colorId = asSingle(req.params.colorId);
  const imageUploads = (req.body as { imageUploads?: Array<{ imageUrl: string; imagePublicId?: string }> }).imageUploads ?? [];

  if (!productId || !colorId) {
    return res.status(400).json({ message: "Product id and color id are required" });
  }

  if (!Array.isArray(imageUploads) || imageUploads.length === 0) {
    return res.status(400).json({ message: "imageUploads is required" });
  }

  const color = await prisma.productColor.findFirst({
    where: { id: colorId, productId }
  });
  if (!color) {
    return res.status(404).json({ message: "Color not found" });
  }

  const maxSort = await prisma.productColorImage.findFirst({
    where: { productColorId: colorId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true }
  });
  const startSort = (maxSort?.sortOrder ?? -1) + 1;

  await prisma.productColorImage.createMany({
    data: imageUploads
      .filter((item) => item?.imageUrl)
      .map((item, index) => ({
        productColorId: colorId,
        imageUrl: item.imageUrl,
        imagePublicId: item.imagePublicId ?? null,
        sortOrder: startSort + index
      }))
  });

  return res.json({ success: true });
});

router.patch("/products/:id/colors/:colorId/images/reorder", requireAdmin, async (req, res) => {
  const productId = asSingle(req.params.id);
  const colorId = asSingle(req.params.colorId);
  const imageIds = (req.body as { imageIds?: string[] }).imageIds ?? [];

  if (!productId || !colorId) {
    return res.status(400).json({ message: "Product id and color id are required" });
  }

  if (!Array.isArray(imageIds) || imageIds.length === 0) {
    return res.status(400).json({ message: "imageIds is required" });
  }

  const color = await prisma.productColor.findFirst({
    where: { id: colorId, productId },
    select: { id: true }
  });
  if (!color) {
    return res.status(404).json({ message: "Color not found" });
  }

  const existing = await prisma.productColorImage.findMany({
    where: { productColorId: colorId },
    select: { id: true }
  });

  if (existing.length !== imageIds.length) {
    return res.status(400).json({ message: "imageIds must include all color images" });
  }

  const existingSet = new Set(existing.map((item) => item.id));
  const incomingSet = new Set(imageIds);
  if (existingSet.size !== incomingSet.size || [...existingSet].some((id) => !incomingSet.has(id))) {
    return res.status(400).json({ message: "imageIds contains invalid image ids" });
  }

  await prisma.$transaction(
    imageIds.map((imageId, index) =>
      prisma.productColorImage.update({
        where: { id: imageId },
        data: { sortOrder: index }
      })
    )
  );

  return res.json({ success: true });
});

router.patch("/products/:id/colors/:colorId/default", requireAdmin, async (req, res) => {
  const productId = asSingle(req.params.id);
  const colorId = asSingle(req.params.colorId);

  if (!productId || !colorId) {
    return res.status(400).json({ message: "Product id and color id are required" });
  }

  const selected = await prisma.productColor.findFirst({
    where: { id: colorId, productId, isActive: true }
  });

  if (!selected) {
    return res.status(404).json({ message: "Color not found" });
  }

  await prisma.$transaction([
    prisma.productColor.updateMany({
      where: { productId },
      data: { isDefault: false }
    }),
    prisma.productColor.update({
      where: { id: colorId },
      data: { isDefault: true }
    })
  ]);

  return res.json({ success: true });
});

router.patch("/products/:id/colors/:colorId/stock", requireAdmin, async (req, res) => {
  const productId = asSingle(req.params.id);
  const colorId = asSingle(req.params.colorId);
  const stockQuantity = Number(req.body?.stockQuantity);

  if (!productId || !colorId) {
    return res.status(400).json({ message: "Product id and color id are required" });
  }

  if (!Number.isFinite(stockQuantity) || stockQuantity < 0) {
    return res.status(400).json({ message: "stockQuantity must be a non-negative number" });
  }

  const existing = await prisma.productColor.findFirst({
    where: { id: colorId, productId }
  });

  if (!existing) {
    return res.status(404).json({ message: "Color not found" });
  }

  const updated = await prisma.productColor.update({
    where: { id: colorId },
    data: { stockQuantity }
  });

  await syncProductStockStatus(productId);

  let notifiedCount = 0;
  if (existing.stockQuantity <= 0 && stockQuantity > 0) {
    const notificationUpdate = await prisma.backInStockRequest.updateMany({
      where: {
        productId,
        productColorId: colorId,
        status: "ACTIVE"
      },
      data: {
        status: "NOTIFIED",
        notifiedAt: new Date()
      }
    });
    notifiedCount = notificationUpdate.count;
  }

  return res.json({ color: updated, notifiedCount });
});

router.patch("/products/:id/stock", requireAdmin, async (req, res) => {
  const idParam = req.params.id;
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const { stockStatus } = req.body as { stockStatus: "IN_STOCK" | "SOLD_OUT" };

  if (!id) {
    return res.status(400).json({ message: "Product id is required" });
  }

  const product = await prisma.product.update({
    where: { id },
    data: { stockStatus }
  });

  return res.json(product);
});

async function uploadToImageKit(imageBuffer: Buffer, originalName: string) {
  const webpQuality = Number(process.env.IMAGE_UPLOAD_WEBP_QUALITY ?? 82);
  const optimized = await sharp(imageBuffer)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: webpQuality })
    .toBuffer();

  const safeOriginalName = originalName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9-_]/g, "-");
  const fileName = `${Date.now()}-${safeOriginalName || randomUUID()}.webp`;
  const folder = process.env.IMAGEKIT_FOLDER ?? "/seere-yaana/products";

  const result = await imagekit.files.upload({
    file: await toFile(optimized, fileName, { type: "image/webp" }),
    fileName,
    folder,
    useUniqueFileName: true
  });

  return {
    imageUrl: result.url,
    imagePublicId: result.fileId
  };
}

router.post("/upload/imagekit", requireAdmin, upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Image file is required" });
  }

  if (
    !process.env.IMAGEKIT_PRIVATE_KEY ||
    !process.env.IMAGEKIT_URL_ENDPOINT
  ) {
    return res.status(500).json({
      message: "ImageKit is not configured. Set IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT."
    });
  }

  const uploaded = await uploadToImageKit(req.file.buffer, req.file.originalname);

  return res.json(uploaded);
});

// Backward-compatible path for existing admin clients.
router.post("/upload/local", requireAdmin, upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Image file is required" });
  }

  if (
    !process.env.IMAGEKIT_PRIVATE_KEY ||
    !process.env.IMAGEKIT_URL_ENDPOINT
  ) {
    return res.status(500).json({
      message: "ImageKit is not configured. Set IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT."
    });
  }

  const uploaded = await uploadToImageKit(req.file.buffer, req.file.originalname);
  return res.json(uploaded);
});

export default router;
