import { randomUUID } from "crypto";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import ImageKit, { toFile } from "@imagekit/nodejs";
import multer from "multer";
import sharp from "sharp";
import QRCode from "qrcode";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/auth.js";
import { getHsnCode, calculateItemGst } from "../lib/gst.js";
import { generateColorSku, generatePieces, removePieces } from "../lib/sku.js";
import { generateInvoiceNumber } from "../lib/invoice.js";
import { createShipmentForPaidOrder } from "../lib/courier.js";

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

type CategorySeedNode = {
  name: string;
  children?: CategorySeedNode[];
};

type CategoryListItem = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
};

type CategoryTreeNode = CategoryListItem & {
  children: CategoryTreeNode[];
};

type CategoryRelationRow = {
  id: string;
  parentId: string | null;
};

type PrismaClientLike = Prisma.TransactionClient | typeof prisma;

function normalizeProductAttribute(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.trim();
}

const DEFAULT_CATEGORY_BLUEPRINT: CategorySeedNode[] = [
  {
    name: "Ilkal Sarees",
    children: [
      { name: "Cotton" },
      {
        name: "Silk",
        children: [{ name: "Handloom" }, { name: "Silk" }]
      }
    ]
  }
];

const adminProductSelect = Prisma.validator<Prisma.ProductSelect>()({
  id: true,
  name: true,
  hidden: true,
  stockStatus: true,
  instagramReelUrl: true,
  packageType: true,
  packageLengthCm: true,
  packageWidthCm: true,
  packageHeightCm: true,
  weightGrams: true,
  sourcePincode: true,
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
  },
  productCategories: {
    select: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
          parentId: true,
          sortOrder: true
        }
      }
    }
  }
});

type AdminProductRow = Prisma.ProductGetPayload<{ select: typeof adminProductSelect }>;

function mapAdminProduct(product: AdminProductRow) {
  const { productCategories, ...rest } = product;

  return {
    ...rest,
    categories: productCategories
      .map((item) => item.category)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  };
}

function normalizeCategoryIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const normalized = item.trim();
    if (!normalized) {
      continue;
    }

    unique.add(normalized);
  }

  return [...unique];
}

function resolveCategoryClosureWithAncestors(
  selectedCategoryIds: string[],
  allCategories: CategoryRelationRow[]
) {
  const parentById = new Map<string, string | null>();
  for (const category of allCategories) {
    parentById.set(category.id, category.parentId);
  }

  const closedSelection = new Set<string>();

  for (const categoryId of selectedCategoryIds) {
    if (!parentById.has(categoryId)) {
      return {
        invalidCategoryId: categoryId,
        categoryIds: [] as string[]
      };
    }

    let cursor: string | null | undefined = categoryId;

    while (cursor) {
      if (closedSelection.has(cursor)) {
        break;
      }

      closedSelection.add(cursor);
      cursor = parentById.get(cursor) ?? null;
    }
  }

  return {
    invalidCategoryId: null,
    categoryIds: [...closedSelection]
  };
}

function slugifyCategoryName(name: string) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "category";
}

async function createUniqueCategorySlug(client: PrismaClientLike, name: string, parentId: string | null) {
  const baseSlug = slugifyCategoryName(name);
  let candidate = baseSlug;
  let suffix = 2;

  while (true) {
    const existing = await client.category.findFirst({
      where: {
        parentId,
        slug: candidate
      },
      select: { id: true }
    });

    if (!existing) {
      return candidate;
    }

    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

async function createCategoryBranch(
  tx: Prisma.TransactionClient,
  node: CategorySeedNode,
  parentId: string | null,
  sortOrder: number
) {
  const slug = await createUniqueCategorySlug(tx, node.name, parentId);
  const created = await tx.category.create({
    data: {
      name: node.name,
      slug,
      parentId,
      sortOrder
    },
    select: { id: true }
  });

  const children = node.children ?? [];
  for (const [index, child] of children.entries()) {
    await createCategoryBranch(tx, child, created.id, index);
  }
}

async function ensureDefaultCategories() {
  const existingCount = await prisma.category.count();
  if (existingCount > 0) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const countInsideTx = await tx.category.count();
    if (countInsideTx > 0) {
      return;
    }

    for (const [index, node] of DEFAULT_CATEGORY_BLUEPRINT.entries()) {
      await createCategoryBranch(tx, node, null, index);
    }
  });
}

function buildCategoryTree(categories: CategoryListItem[]) {
  const nodes = new Map<string, CategoryTreeNode>();
  for (const category of categories) {
    nodes.set(category.id, { ...category, children: [] });
  }

  const roots: CategoryTreeNode[] = [];
  for (const node of nodes.values()) {
    if (!node.parentId) {
      roots.push(node);
      continue;
    }

    const parent = nodes.get(node.parentId);
    if (parent) {
      parent.children.push(node);
      continue;
    }

    roots.push(node);
  }

  const sortNodes = (items: CategoryTreeNode[]) => {
    items.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    for (const item of items) {
      sortNodes(item.children);
    }
  };

  sortNodes(roots);
  return roots;
}

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

router.get("/categories", requireAdmin, async (_req, res) => {
  await ensureDefaultCategories();

  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      parentId: true,
      sortOrder: true
    }
  });

  return res.json(buildCategoryTree(categories));
});

router.post("/categories", requireAdmin, async (req, res) => {
  const { name, parentId, sortOrder } = req.body as {
    name?: string;
    parentId?: string | null;
    sortOrder?: number;
  };

  const trimmedName = name?.trim();
  if (!trimmedName) {
    return res.status(400).json({ message: "Category name is required" });
  }

  const normalizedParentId = typeof parentId === "string" && parentId.trim() ? parentId.trim() : null;
  if (normalizedParentId) {
    const parent = await prisma.category.findUnique({
      where: { id: normalizedParentId },
      select: { id: true }
    });

    if (!parent) {
      return res.status(404).json({ message: "Parent category not found" });
    }
  }

  const numericSortOrder = Number(sortOrder);
  const hasCustomSortOrder = Number.isFinite(numericSortOrder);

  const created = await prisma.$transaction(async (tx) => {
    const siblingWithHighestSortOrder = await tx.category.findFirst({
      where: { parentId: normalizedParentId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true }
    });

    const nextSortOrder = hasCustomSortOrder
      ? Math.max(0, Math.floor(numericSortOrder))
      : (siblingWithHighestSortOrder?.sortOrder ?? -1) + 1;

    const slug = await createUniqueCategorySlug(tx, trimmedName, normalizedParentId);
    return tx.category.create({
      data: {
        name: trimmedName,
        slug,
        parentId: normalizedParentId,
        sortOrder: nextSortOrder
      },
      select: {
        id: true,
        name: true,
        slug: true,
        parentId: true,
        sortOrder: true
      }
    });
  });

  return res.status(201).json(created);
});

router.get("/products", requireAdmin, async (_req, res) => {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    select: adminProductSelect
  });

  return res.json(products.map(mapAdminProduct));
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
    imageUploads,
    categoryIds
  } = req.body;

  const normalizedCategoryIds = normalizeCategoryIds(categoryIds);
  const normalizedFabric = normalizeProductAttribute(fabric);
  const normalizedCraft = normalizeProductAttribute(craft);
  let hierarchicalCategoryIds = normalizedCategoryIds;

  if (!normalizedFabric || !normalizedCraft) {
    return res.status(400).json({ message: "Material and saree category are required" });
  }

  const uploads = Array.isArray(imageUploads)
    ? (imageUploads as Array<{ imageUrl: string; imagePublicId?: string }>).filter((item) => item?.imageUrl)
    : [];

  const coverImageUrl = uploads[0]?.imageUrl ?? imageUrl;
  const coverImagePublicId = uploads[0]?.imagePublicId ?? imagePublicId;

  if (!coverImageUrl) {
    return res.status(400).json({ message: "At least one product image is required" });
  }

  if (normalizedCategoryIds.length > 0) {
    const allCategories = await prisma.category.findMany({
      select: {
        id: true,
        parentId: true
      }
    });

    const resolvedCategoryClosure = resolveCategoryClosureWithAncestors(
      normalizedCategoryIds,
      allCategories
    );

    if (resolvedCategoryClosure.invalidCategoryId) {
      return res.status(400).json({ message: "One or more category ids are invalid" });
    }

    hierarchicalCategoryIds = resolvedCategoryClosure.categoryIds;
  }

  const createdProduct = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        name,
        description,
        fabric: normalizedFabric,
        craft: normalizedCraft,
        lengthInMeters,
        blouseIncluded,
        hasHandloomMark: Boolean(req.body.hasHandloomMark),
        priceInPaise,
        imageUrl: coverImageUrl,
        imagePublicId: coverImagePublicId,
        instagramReelUrl: req.body.instagramReelUrl ?? null,
        packageType: req.body.packageType ?? undefined,
        packageLengthCm: req.body.packageLengthCm != null ? Number(req.body.packageLengthCm) : undefined,
        packageWidthCm: req.body.packageWidthCm != null ? Number(req.body.packageWidthCm) : undefined,
        packageHeightCm: req.body.packageHeightCm != null ? Number(req.body.packageHeightCm) : undefined,
        weightGrams: req.body.weightGrams != null ? Number(req.body.weightGrams) : undefined,
        sourcePincode: req.body.sourcePincode ?? undefined,
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

    if (hierarchicalCategoryIds.length > 0) {
      await tx.productCategory.createMany({
        data: hierarchicalCategoryIds.map((categoryId) => ({
          productId: created.id,
          categoryId
        }))
      });
    }

    return created;
  });

  const product = await prisma.product.findUnique({
    where: { id: createdProduct.id },
    select: adminProductSelect
  });

  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  return res.status(201).json(mapAdminProduct(product));
});

router.patch("/products/:id/categories", requireAdmin, async (req, res) => {
  const productId = asSingle(req.params.id);

  if (!productId) {
    return res.status(400).json({ message: "Product id is required" });
  }

  const normalizedCategoryIds = normalizeCategoryIds(req.body?.categoryIds);
  let hierarchicalCategoryIds = normalizedCategoryIds;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true }
  });

  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  if (normalizedCategoryIds.length > 0) {
    const allCategories = await prisma.category.findMany({
      select: {
        id: true,
        parentId: true
      }
    });

    const resolvedCategoryClosure = resolveCategoryClosureWithAncestors(
      normalizedCategoryIds,
      allCategories
    );

    if (resolvedCategoryClosure.invalidCategoryId) {
      return res.status(400).json({ message: "One or more category ids are invalid" });
    }

    hierarchicalCategoryIds = resolvedCategoryClosure.categoryIds;
  }

  await prisma.$transaction(async (tx) => {
    await tx.productCategory.deleteMany({ where: { productId } });

    if (hierarchicalCategoryIds.length > 0) {
      await tx.productCategory.createMany({
        data: hierarchicalCategoryIds.map((categoryId) => ({
          productId,
          categoryId
        }))
      });
    }
  });

  const updated = await prisma.product.findUnique({
    where: { id: productId },
    select: adminProductSelect
  });

  if (!updated) {
    return res.status(404).json({ message: "Product not found" });
  }

  return res.json(mapAdminProduct(updated));
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

// Delete a single product gallery image (and its ImageKit asset).
router.delete("/products/:id/images/:imageId", requireAdmin, async (req, res) => {
  const productId = asSingle(req.params.id);
  const imageId = asSingle(req.params.imageId);

  if (!productId || !imageId) {
    return res.status(400).json({ message: "Product id and image id are required" });
  }

  const image = await prisma.productImage.findFirst({
    where: { id: imageId, productId },
    select: { id: true, imagePublicId: true }
  });

  if (!image) {
    return res.status(404).json({ message: "Image not found" });
  }

  await prisma.$transaction(async (tx) => {
    await tx.productImage.delete({ where: { id: imageId } });

    // Re-normalize sortOrder so the gallery stays contiguous.
    const remaining = await tx.productImage.findMany({
      where: { productId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, imageUrl: true, imagePublicId: true }
    });

    await Promise.all(
      remaining.map((item, index) =>
        tx.productImage.update({ where: { id: item.id }, data: { sortOrder: index } })
      )
    );

    // Keep the product cover pointing at the new first image (if any remain).
    const firstImage = remaining[0];
    if (firstImage) {
      await tx.product.update({
        where: { id: productId },
        data: { imageUrl: firstImage.imageUrl, imagePublicId: firstImage.imagePublicId }
      });
    }
  });

  const imageCleanup = await deleteImageKitFiles([image.imagePublicId]);

  return res.json({
    message: "Image deleted",
    deletedId: imageId,
    images: {
      attempted: imageCleanup.attempted,
      removed: imageCleanup.deleted,
      failed: imageCleanup.failed.length
    }
  });
});

router.post("/products/:id/colors", requireAdmin, async (req, res) => {
  const productId = asSingle(req.params.id);
  const {
    name,
    colorCode,
    borderColorName,
    borderColorCode,
    isDefault,
    stockQuantity,
    priceInPaise,
    imageUrls,
    imageUploads
  } = req.body as {
    name?: string;
    colorCode?: string;
    borderColorName?: string;
    borderColorCode?: string;
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

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, craft: true, sequenceNumber: true }
  });

  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  const sku = generateColorSku({
    craft: product.craft,
    productSequenceNumber: product.sequenceNumber,
    colorName: name.trim(),
    borderColorName: borderColorName?.trim() ?? null
  });

  const normalizedQty = Math.max(0, Number(stockQuantity ?? 0));
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
        borderColorName: borderColorName?.trim() || null,
        borderColorCode: borderColorCode?.trim() || null,
        sku,
        isDefault: shouldBeDefault,
        stockQuantity: normalizedQty,
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

    await generatePieces(tx, created.id, sku, normalizedQty);

    return created;
  });

  await syncProductStockStatus(productId);

  const withImages = await prisma.productColor.findUnique({
    where: { id: color.id },
    include: {
      images: {
        orderBy: { sortOrder: "asc" }
      },
      pieces: {
        orderBy: { pieceNumber: "asc" },
        select: { serial: true, pieceNumber: true, status: true }
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

// Delete a single color image (and its ImageKit asset).
router.delete("/products/:id/colors/:colorId/images/:imageId", requireAdmin, async (req, res) => {
  const productId = asSingle(req.params.id);
  const colorId = asSingle(req.params.colorId);
  const imageId = asSingle(req.params.imageId);

  if (!productId || !colorId || !imageId) {
    return res.status(400).json({ message: "Product id, color id and image id are required" });
  }

  const image = await prisma.productColorImage.findFirst({
    where: { id: imageId, productColor: { id: colorId, productId } },
    select: { id: true, imagePublicId: true }
  });

  if (!image) {
    return res.status(404).json({ message: "Image not found" });
  }

  await prisma.$transaction(async (tx) => {
    await tx.productColorImage.delete({ where: { id: imageId } });

    const remaining = await tx.productColorImage.findMany({
      where: { productColorId: colorId },
      orderBy: { sortOrder: "asc" },
      select: { id: true }
    });

    await Promise.all(
      remaining.map((item, index) =>
        tx.productColorImage.update({ where: { id: item.id }, data: { sortOrder: index } })
      )
    );
  });

  const imageCleanup = await deleteImageKitFiles([image.imagePublicId]);

  return res.json({
    message: "Image deleted",
    deletedId: imageId,
    images: {
      attempted: imageCleanup.attempted,
      removed: imageCleanup.deleted,
      failed: imageCleanup.failed.length
    }
  });
});

// Delete a color variant entirely (and all its ImageKit assets).
router.delete("/products/:id/colors/:colorId", requireAdmin, async (req, res) => {
  const productId = asSingle(req.params.id);
  const colorId = asSingle(req.params.colorId);

  if (!productId || !colorId) {
    return res.status(400).json({ message: "Product id and color id are required" });
  }

  const color = await prisma.productColor.findFirst({
    where: { id: colorId, productId },
    select: {
      id: true,
      name: true,
      isDefault: true,
      images: { select: { imagePublicId: true } }
    }
  });

  if (!color) {
    return res.status(404).json({ message: "Color not found" });
  }

  // A product must always retain at least one color.
  const totalColors = await prisma.productColor.count({ where: { productId } });
  if (totalColors <= 1) {
    return res.status(400).json({
      message: "Cannot delete the only color of a product. Delete the product instead."
    });
  }

  // Block deletion when the color appears in any paid order (preserve history).
  const paidOrderItems = await prisma.orderItem.findMany({
    where: { productColorId: colorId, order: { status: "PAID" } },
    select: { id: true }
  });

  if (paidOrderItems.length > 0) {
    return res.status(400).json({
      message: "Cannot delete a color with paid orders. Set its stock to 0 instead.",
      paidOrderCount: paidOrderItems.length
    });
  }

  const imageFileIds = color.images.map((item) => item.imagePublicId);

  await prisma.$transaction(async (tx) => {
    // ProductPiece uses onDelete: Restrict, so remove pieces explicitly first.
    await tx.productPiece.deleteMany({ where: { productColorId: colorId } });
    // Cascade removes ProductColorImage and BackInStockRequest rows.
    await tx.productColor.delete({ where: { id: colorId } });

    // Reassign the default flag if the removed color was the default.
    if (color.isDefault) {
      const nextDefault = await tx.productColor.findFirst({
        where: { productId },
        orderBy: { createdAt: "asc" },
        select: { id: true }
      });
      if (nextDefault) {
        await tx.productColor.update({ where: { id: nextDefault.id }, data: { isDefault: true } });
      }
    }

    // Recompute the product stock status from the remaining colors.
    const remaining = await tx.productColor.findMany({
      where: { productId },
      select: { stockQuantity: true }
    });
    const hasInStock = remaining.some((item) => item.stockQuantity > 0);
    await tx.product.update({
      where: { id: productId },
      data: { stockStatus: hasInStock ? "IN_STOCK" : "SOLD_OUT" }
    });
  });

  const imageCleanup = await deleteImageKitFiles(imageFileIds);

  return res.json({
    message: `Color "${color.name}" deleted`,
    deletedId: colorId,
    images: {
      attempted: imageCleanup.attempted,
      removed: imageCleanup.deleted,
      failed: imageCleanup.failed.length
    }
  });
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

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.productColor.update({
      where: { id: colorId },
      data: { stockQuantity }
    });

    const diff = stockQuantity - existing.stockQuantity;
    const colorSku = existing.sku ?? "";

    if (diff > 0 && colorSku) {
      await generatePieces(tx, colorId, colorSku, diff);
    } else if (diff < 0) {
      await removePieces(tx, colorId, Math.abs(diff));
    }

    return result;
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

router.patch("/products/:id/reel", requireAdmin, async (req, res) => {
  const id = asSingle(req.params.id);
  const { instagramReelUrl } = req.body as { instagramReelUrl?: string | null };

  if (!id) {
    return res.status(400).json({ message: "Product id is required" });
  }

  const product = await prisma.product.update({
    where: { id },
    data: { instagramReelUrl: instagramReelUrl || null },
    select: adminProductSelect
  });

  return res.json(mapAdminProduct(product));
});

router.patch("/products/:id/delivery", requireAdmin, async (req, res) => {
  const id = asSingle(req.params.id);

  if (!id) {
    return res.status(400).json({ message: "Product id is required" });
  }

  const { packageType, packageLengthCm, packageWidthCm, packageHeightCm, weightGrams, sourcePincode } = req.body as {
    packageType?: string;
    packageLengthCm?: number;
    packageWidthCm?: number;
    packageHeightCm?: number;
    weightGrams?: number;
    sourcePincode?: string;
  };

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...(packageType != null && { packageType }),
      ...(packageLengthCm != null && { packageLengthCm: Number(packageLengthCm) }),
      ...(packageWidthCm != null && { packageWidthCm: Number(packageWidthCm) }),
      ...(packageHeightCm != null && { packageHeightCm: Number(packageHeightCm) }),
      ...(weightGrams != null && { weightGrams: Number(weightGrams) }),
      ...(sourcePincode != null && { sourcePincode }),
    },
    select: adminProductSelect,
  });

  return res.json(mapAdminProduct(product));
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

// Best-effort removal of ImageKit assets by fileId. Never throws — the database
// is the source of truth, so a cloud cleanup failure must not block a delete.
async function deleteImageKitFiles(fileIds: Array<string | null | undefined>) {
  const ids = [...new Set(fileIds.filter((id): id is string => Boolean(id && id.trim())))];
  if (ids.length === 0) {
    return { attempted: 0, deleted: 0, failed: [] as string[] };
  }

  if (!process.env.IMAGEKIT_PRIVATE_KEY) {
    console.warn("[imagekit cleanup skipped] IMAGEKIT_PRIVATE_KEY is not configured");
    return { attempted: ids.length, deleted: 0, failed: ids };
  }

  let deleted = 0;
  const failed: string[] = [];

  // ImageKit bulk delete accepts a maximum of 100 fileIds per request.
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    try {
      const result = await imagekit.files.bulk.delete({ fileIds: chunk });
      deleted += result.successfullyDeletedFileIds?.length ?? chunk.length;
    } catch (error) {
      console.error("[imagekit bulk delete failed]", error);
      failed.push(...chunk);
    }
  }

  return { attempted: ids.length, deleted, failed };
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

// ─── Orders list ─────────────────────────────────────────────────────────────

router.get("/orders", requireAdmin, async (_req, res) => {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true } },
          productColor: { select: { id: true, name: true, sku: true } }
        }
      }
    }
  });
  return res.json(orders);
});

// ─── Piece management ─────────────────────────────────────────────────────────

// List all pieces for a specific color variant.
router.get("/products/:id/colors/:colorId/pieces", requireAdmin, async (req, res) => {
  const productId = asSingle(req.params.id);
  const colorId = asSingle(req.params.colorId);

  if (!productId || !colorId) {
    return res.status(400).json({ message: "Product id and color id are required" });
  }

  const color = await prisma.productColor.findFirst({
    where: { id: colorId, productId },
    select: { id: true, sku: true }
  });

  if (!color) {
    return res.status(404).json({ message: "Color not found" });
  }

  const pieces = await prisma.productPiece.findMany({
    where: { productColorId: colorId },
    orderBy: { pieceNumber: "asc" },
    select: {
      id: true,
      serial: true,
      pieceNumber: true,
      status: true,
      allocatedOrderItemId: true,
      createdAt: true
    }
  });

  return res.json({ sku: color.sku, pieces });
});

// Look up a single piece by scanning its QR code serial.
router.get("/pieces/:serial", requireAdmin, async (req, res) => {
  const serial = asSingle(req.params.serial);
  if (!serial) {
    return res.status(400).json({ message: "Serial is required" });
  }

  const piece = await prisma.productPiece.findUnique({
    where: { serial },
    include: {
      productColor: {
        select: {
          id: true,
          name: true,
          sku: true,
          borderColorName: true,
          product: {
            select: { id: true, name: true, craft: true, fabric: true }
          }
        }
      },
      orderItem: {
        select: {
          id: true,
          quantity: true,
          order: {
            select: {
              id: true,
              invoiceNumber: true,
              status: true,
              customerName: true,
              customerEmail: true,
              customerPhone: true,
              deliveryState: true,
              deliveryAddressSnapshot: true,
              invoiceDate: true
            }
          }
        }
      }
    }
  });

  if (!piece) {
    return res.status(404).json({ message: "Piece not found" });
  }

  return res.json(piece);
});

// Return a QR code PNG for a piece serial — used for sticker printing.
// The QR encodes the serial string; the admin page renders the full sticker.
router.get("/pieces/:serial/qr", requireAdmin, async (req, res) => {
  const serial = asSingle(req.params.serial);
  if (!serial) {
    return res.status(400).json({ message: "Serial is required" });
  }

  const piece = await prisma.productPiece.findUnique({
    where: { serial },
    select: { serial: true }
  });

  if (!piece) {
    return res.status(404).json({ message: "Piece not found" });
  }

  const qrBuffer = await QRCode.toBuffer(serial, {
    type: "png",
    width: 300,
    margin: 1,
    color: { dark: "#2a201a", light: "#ffffff" }
  });

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", `inline; filename="${serial}.png"`);
  return res.send(qrBuffer);
});

// ─── Invoice ──────────────────────────────────────────────────────────────────

// Returns full invoice JSON for a paid order.
router.get("/orders/:id/invoice", requireAdmin, async (req, res) => {
  const orderId = asSingle(req.params.id);
  if (!orderId) {
    return res.status(400).json({ message: "Order id is required" });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: {
            select: { id: true, name: true, fabric: true, craft: true, hasHandloomMark: true }
          },
          productColor: {
            select: { id: true, name: true, sku: true, borderColorName: true }
          },
          pieces: {
            select: { serial: true, pieceNumber: true, status: true }
          }
        }
      }
    }
  });

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  if (order.status !== "PAID") {
    return res.status(400).json({ message: "Invoice is only available for paid orders" });
  }

  const seller = {
    name: process.env.BUSINESS_NAME ?? "Seere Yaana",
    address: process.env.BUSINESS_ADDRESS ?? "",
    city: process.env.BUSINESS_CITY ?? "Bengaluru",
    state: "Karnataka",
    pincode: process.env.BUSINESS_PINCODE ?? "",
    gstin: process.env.BUSINESS_GSTIN ?? "",
    pan: process.env.BUSINESS_PAN ?? ""
  };

  const deliveryAddress = order.deliveryAddressSnapshot as Record<string, unknown> | null;

  const invoice = {
    invoiceNumber: order.invoiceNumber,
    invoiceDate: order.invoiceDate,
    seller,
    buyer: {
      name: order.customerName,
      email: order.customerEmail,
      phone: order.customerPhone,
      address: deliveryAddress,
      state: order.deliveryState
    },
    items: order.items.map((item) => ({
      description: item.product.name,
      colorName: item.productColor?.name ?? null,
      borderColorName: item.productColor?.borderColorName ?? null,
      sku: item.productColor?.sku ?? null,
      hsnCode: item.hsnCode ?? getHsnCode(item.product.fabric),
      quantity: item.quantity,
      unitPriceInPaise: item.priceAtTime,
      gstRatePercent: item.gstRatePercent,
      taxableAmountInPaise: item.taxableAmountInPaise,
      cgstInPaise: item.cgstInPaise,
      sgstInPaise: item.sgstInPaise,
      igstInPaise: item.igstInPaise,
      lineTotalInPaise: item.priceAtTime * item.quantity,
      pieceSerials: item.pieces.map((p) => p.serial)
    })),
    totals: {
      taxableAmountInPaise: order.taxableAmountInPaise,
      cgstInPaise: order.cgstInPaise,
      sgstInPaise: order.sgstInPaise,
      igstInPaise: order.igstInPaise,
      grandTotalInPaise: order.amountInPaise
    },
    notes: "Goods once sold will not be taken back or exchanged.",
    declaration: "I/We hereby certify that the goods mentioned in this invoice are warranted to be of the nature and quality which they purport to be."
  };

  return res.json(invoice);
});

// ─── GST Report (GSTR-1 B2CS) ─────────────────────────────────────────────────

// Returns a GSTR-1 B2CS summary for the given month (format: YYYY-MM).
// B2CS = aggregate of all B2C supplies to unregistered buyers.
// Used for monthly GST filing.
router.get("/reports/gst", requireAdmin, async (req, res) => {
  const monthParam = asSingle(req.query.month as string | undefined);

  if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
    return res.status(400).json({ message: "month query param is required (format: YYYY-MM)" });
  }

  const [year, month] = monthParam.split("-").map(Number) as [number, number];
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  const orders = await prisma.order.findMany({
    where: {
      status: "PAID",
      invoiceDate: { gte: startDate, lt: endDate }
    },
    include: {
      items: {
        select: {
          hsnCode: true,
          gstRatePercent: true,
          taxableAmountInPaise: true,
          cgstInPaise: true,
          sgstInPaise: true,
          igstInPaise: true
        }
      }
    },
    orderBy: { invoiceDate: "asc" }
  });

  // Group by place of supply + GST rate for B2CS table.
  type B2csKey = string;
  const b2csMap = new Map<B2csKey, {
    placeOfSupply: string;
    gstRatePercent: number;
    taxableAmountInPaise: number;
    cgstInPaise: number;
    sgstInPaise: number;
    igstInPaise: number;
    invoiceCount: number;
  }>();

  for (const order of orders) {
    const state = order.deliveryState ?? "Unknown";
    for (const item of order.items) {
      const key = `${state}::${item.gstRatePercent}`;
      const existing = b2csMap.get(key);
      if (existing) {
        existing.taxableAmountInPaise += item.taxableAmountInPaise;
        existing.cgstInPaise += item.cgstInPaise;
        existing.sgstInPaise += item.sgstInPaise;
        existing.igstInPaise += item.igstInPaise;
        existing.invoiceCount += 1;
      } else {
        b2csMap.set(key, {
          placeOfSupply: state,
          gstRatePercent: item.gstRatePercent,
          taxableAmountInPaise: item.taxableAmountInPaise,
          cgstInPaise: item.cgstInPaise,
          sgstInPaise: item.sgstInPaise,
          igstInPaise: item.igstInPaise,
          invoiceCount: 1
        });
      }
    }
  }

  const totalTaxable = orders.reduce((s, o) => s + o.taxableAmountInPaise, 0);
  const totalCgst = orders.reduce((s, o) => s + o.cgstInPaise, 0);
  const totalSgst = orders.reduce((s, o) => s + o.sgstInPaise, 0);
  const totalIgst = orders.reduce((s, o) => s + o.igstInPaise, 0);
  const grandTotal = orders.reduce((s, o) => s + o.amountInPaise, 0);

  return res.json({
    month: monthParam,
    invoiceCount: orders.length,
    b2cs: [...b2csMap.values()].sort((a, b) =>
      a.placeOfSupply.localeCompare(b.placeOfSupply) || a.gstRatePercent - b.gstRatePercent
    ),
    totals: {
      taxableAmountInPaise: totalTaxable,
      cgstInPaise: totalCgst,
      sgstInPaise: totalSgst,
      igstInPaise: totalIgst,
      grandTotalInPaise: grandTotal
    },
    invoices: orders.map((o) => ({
      orderId: o.id,
      invoiceNumber: o.invoiceNumber,
      invoiceDate: o.invoiceDate,
      customerName: o.customerName,
      deliveryState: o.deliveryState,
      amountInPaise: o.amountInPaise,
      taxableAmountInPaise: o.taxableAmountInPaise,
      cgstInPaise: o.cgstInPaise,
      sgstInPaise: o.sgstInPaise,
      igstInPaise: o.igstInPaise
    }))
  });
});

// ─── Product Visibility ────────────────────────────────────────────────────────

// Hide a product (soft delete — won't appear in listings).
router.patch("/products/:id/hide", requireAdmin, async (req, res) => {
  const productId = asSingle(req.params.id);

  if (!productId) {
    return res.status(400).json({ message: "Product id is required" });
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, hidden: true }
  });

  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  const updated = await prisma.product.update({
    where: { id: productId },
    data: { hidden: true }
  });

  return res.json({ message: "Product hidden", hidden: updated.hidden });
});

// Delete a product entirely (cascades to images, colors, pieces, orders).
router.delete("/products/:id", requireAdmin, async (req, res) => {
  const productId = asSingle(req.params.id);

  if (!productId) {
    return res.status(400).json({ message: "Product id is required" });
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      imagePublicId: true,
      images: { select: { imagePublicId: true } },
      colors: { select: { images: { select: { imagePublicId: true } } } }
    }
  });

  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  // Check if there are any paid orders containing this product.
  const paidOrders = await prisma.orderItem.findMany({
    where: {
      productId,
      order: { status: "PAID" }
    },
    select: { id: true }
  });

  if (paidOrders.length > 0) {
    return res.status(400).json({
      message: "Cannot delete product with paid orders. Hide it instead.",
      paidOrderCount: paidOrders.length
    });
  }

  // Collect every ImageKit asset tied to the product (cover, gallery, color images).
  const imageFileIds = [
    product.imagePublicId,
    ...product.images.map((image) => image.imagePublicId),
    ...product.colors.flatMap((color) => color.images.map((image) => image.imagePublicId))
  ];

  // Safe to delete: cascade will handle orphaned records.
  await prisma.product.delete({
    where: { id: productId }
  });

  // Remove the now-orphaned assets from ImageKit (best-effort, after the DB delete).
  const imageCleanup = await deleteImageKitFiles(imageFileIds);

  return res.json({
    message: `Product "${product.name}" deleted`,
    deletedId: productId,
    images: {
      attempted: imageCleanup.attempted,
      removed: imageCleanup.deleted,
      failed: imageCleanup.failed.length
    }
  });
});

// ─── Bulk Restock ──────────────────────────────────────────────────────────────

// Add multiple new pieces to a color's inventory.
// Body: { quantity: number } — adds `quantity` new pieces with status IN_STOCK.
router.post("/products/:id/colors/:colorId/restock", requireAdmin, async (req, res) => {
  const productId = asSingle(req.params.id);
  const colorId = asSingle(req.params.colorId);
  const quantity = Number(req.body?.quantity);

  if (!productId || !colorId) {
    return res.status(400).json({ message: "Product id and color id are required" });
  }

  if (!Number.isFinite(quantity) || quantity < 1) {
    return res.status(400).json({ message: "quantity must be a positive number" });
  }

  const color = await prisma.productColor.findFirst({
    where: { id: colorId, productId },
    select: { id: true, sku: true, stockQuantity: true }
  });

  if (!color) {
    return res.status(404).json({ message: "Color not found" });
  }

  if (!color.sku) {
    return res.status(400).json({ message: "Color SKU is missing" });
  }

  const colorSku = color.sku;
  const updated = await prisma.$transaction(async (tx) => {
    // Generate and insert new pieces.
    await generatePieces(tx, colorId, colorSku, quantity);

    // Update the color's stock quantity.
    return tx.productColor.update({
      where: { id: colorId },
      data: { stockQuantity: color.stockQuantity + quantity }
    });
  });

  await syncProductStockStatus(productId);

  return res.json({
    message: `Restocked ${quantity} piece(s)`,
    colorId,
    newStockQuantity: updated.stockQuantity,
    totalAdded: quantity
  });
});

// ── Retry shipment creation for a paid order ──────────────────────────────
router.post("/orders/:id/retry-shipment", requireAdmin, async (req, res) => {
  const orderId = asSingle(req.params.id);
  if (!orderId) {
    return res.status(400).json({ message: "Order id is required" });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true },
  });

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  if (order.status !== "PAID") {
    return res.status(400).json({ message: `Order status is ${order.status}, shipment can only be created for PAID orders` });
  }

  try {
    const shipments = await createShipmentForPaidOrder(orderId);
    if (!shipments) {
      return res.status(400).json({ message: "No courier provider configured or order is not eligible" });
    }

    const allBooked = shipments.every((s) => s.status === "BOOKED");
    const anyFailed = shipments.some((s) => s.status === "FAILED");

    return res.json({
      message: allBooked
        ? `${shipments.length} shipment(s) created successfully`
        : anyFailed
          ? "One or more shipments failed"
          : "Shipment creation in progress",
      shipments: shipments.map((s) => ({
        id: s.id,
        status: s.status,
        provider: s.provider,
        sourcePincode: s.sourcePincode,
        providerShipmentId: s.providerShipmentId,
        providerWaybill: s.providerWaybill,
        providerReference: s.providerReference,
        failureMessage: s.failureMessage,
        bookedAt: s.bookedAt,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shipment creation failed";
    console.error("[admin] retry-shipment error for order", orderId, error);
    return res.status(502).json({ message });
  }
});

export default router;
