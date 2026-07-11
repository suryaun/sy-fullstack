import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { checkDeliveryPostalCodeServiceability } from "../lib/courier.js";

const router = Router();

// Relevance weights for the "you may also like" recommender.
const RELATED_CATEGORY_WEIGHT = 5;
const RELATED_CRAFT_WEIGHT = 3;
const RELATED_FABRIC_WEIGHT = 2;
const RELATED_PRICE_WEIGHT = 2;
const RELATED_IN_STOCK_WEIGHT = 1;
const RELATED_PRICE_BAND = 0.3;
const RELATED_MIN_RESULTS = 4;
const RELATED_DEFAULT_LIMIT = 12;
const RELATED_MAX_LIMIT = 24;

const productListSelect = Prisma.validator<Prisma.ProductSelect>()({
  id: true,
  name: true,
  description: true,
  fabric: true,
  craft: true,
  lengthInMeters: true,
  blouseIncluded: true,
  priceInPaise: true,
  stockStatus: true,
  hidden: true,
  imageUrl: true,
  images: {
    orderBy: { sortOrder: "asc" },
    select: {
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
      colorCode: true,
      isDefault: true,
      stockQuantity: true,
      priceInPaise: true,
      images: {
        orderBy: { sortOrder: "asc" },
        select: {
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

const productDetailSelect = Prisma.validator<Prisma.ProductSelect>()({
  id: true,
  name: true,
  description: true,
  fabric: true,
  craft: true,
  lengthInMeters: true,
  blouseIncluded: true,
  priceInPaise: true,
  stockStatus: true,
  hidden: true,
  imageUrl: true,
  imagePublicId: true,
  instagramReelUrl: true,
  createdAt: true,
  updatedAt: true,
  images: {
    orderBy: { sortOrder: "asc" }
  },
  colors: {
    where: { isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: {
      images: { orderBy: { sortOrder: "asc" } }
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

type ProductListRow = Prisma.ProductGetPayload<{ select: typeof productListSelect }>;
type ProductDetailRow = Prisma.ProductGetPayload<{ select: typeof productDetailSelect }>;

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

function mapCategoriesForResponse(productCategories: Array<{ category: { id: string; name: string; slug: string; parentId: string | null; sortOrder: number } }>) {
  return productCategories
    .map((item) => item.category)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

function mapProductListItem(product: ProductListRow) {
  const { productCategories, ...rest } = product;
  return {
    ...rest,
    categories: mapCategoriesForResponse(productCategories)
  };
}

function mapProductDetailItem(product: ProductDetailRow) {
  const { productCategories, ...rest } = product;
  return {
    ...rest,
    categories: mapCategoriesForResponse(productCategories)
  };
}

function asSingle(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
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

router.get("/", async (_req, res) => {
  const products = await prisma.product.findMany({
    where: { hidden: false },
    orderBy: { createdAt: "desc" },
    select: productListSelect
  });

  return res.json(products.map(mapProductListItem));
});

router.get("/categories", async (_req, res) => {
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

router.get("/oembed", async (req, res) => {
  const url = req.query.url as string | undefined;
  if (!url) {
    return res.status(400).json({ message: "url query parameter is required" });
  }

  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) {
    return res.status(500).json({ message: "Instagram oEmbed credentials not configured" });
  }

  const accessToken = `${appId}|${appSecret}`;
  const oembedUrl = `https://graph.facebook.com/v25.0/instagram_oembed?url=${encodeURIComponent(url)}&access_token=${encodeURIComponent(accessToken)}&omitscript=true`;

  try {
    const response = await fetch(oembedUrl);
    if (!response.ok) {
      const body = await response.text();
      return res.status(response.status).json({ message: "Instagram oEmbed request failed", detail: body });
    }
    const data = await response.json();
    return res.json(data);
  } catch (error) {
    return res.status(502).json({ message: "Failed to reach Instagram oEmbed API" });
  }
});

router.get("/serviceability", async (req, res) => {
  const postalCode = (req.query.postalCode as string ?? "").trim();
  if (!postalCode) {
    return res.status(400).json({ message: "postalCode is required" });
  }

  try {
    const result = await checkDeliveryPostalCodeServiceability(postalCode);
    const { raw, ...publicFields } = result;
    return res.json(publicFields);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[serviceability error]", errorMessage, error);
    return res.status(502).json({
      message: errorMessage,
      error: "Courier serviceability check failed",
    });
  }
});

router.get("/:id", async (req, res) => {
  const productId = asSingle(req.params.id);
  if (!productId) {
    return res.status(400).json({ message: "Product id is required" });
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: productDetailSelect
  });

  if (!product || product.hidden) {
    return res.status(404).json({ message: "Product not found" });
  }

  const mappedProduct = mapProductDetailItem(product);
  const defaultColor = mappedProduct.colors.find((color) => color.isDefault) ?? mappedProduct.colors[0] ?? null;

  return res.json({
    ...mappedProduct,
    defaultColorId: defaultColor?.id ?? null
  });
});

router.get("/:id/related", async (req, res) => {
  const productId = asSingle(req.params.id);
  if (!productId) {
    return res.status(400).json({ message: "Product id is required" });
  }

  const limitParam = Number.parseInt(asSingle(req.query.limit as string | string[] | undefined) ?? "", 10);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), RELATED_MAX_LIMIT)
    : RELATED_DEFAULT_LIMIT;

  const current = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      hidden: true,
      craft: true,
      fabric: true,
      priceInPaise: true,
      productCategories: { select: { categoryId: true } }
    }
  });

  if (!current || current.hidden) {
    return res.status(404).json({ message: "Product not found" });
  }

  const categoryIds = current.productCategories.map((item) => item.categoryId);
  const categoryIdSet = new Set(categoryIds);

  // Pre-filter candidates to products that share a category, craft, or fabric.
  const candidateFilters: Prisma.ProductWhereInput[] = [
    { craft: current.craft },
    { fabric: current.fabric }
  ];
  if (categoryIds.length > 0) {
    candidateFilters.push({ productCategories: { some: { categoryId: { in: categoryIds } } } });
  }

  const candidates = await prisma.product.findMany({
    where: {
      hidden: false,
      id: { not: current.id },
      OR: candidateFilters
    },
    orderBy: { createdAt: "desc" },
    select: productListSelect
  });

  const lowerPrice = current.priceInPaise * (1 - RELATED_PRICE_BAND);
  const upperPrice = current.priceInPaise * (1 + RELATED_PRICE_BAND);

  const scored = candidates
    .map((candidate) => {
      const sharedCategories = candidate.productCategories.reduce(
        (count, item) => (categoryIdSet.has(item.category.id) ? count + 1 : count),
        0
      );
      let score = sharedCategories * RELATED_CATEGORY_WEIGHT;
      if (candidate.craft === current.craft) score += RELATED_CRAFT_WEIGHT;
      if (candidate.fabric === current.fabric) score += RELATED_FABRIC_WEIGHT;
      if (candidate.priceInPaise >= lowerPrice && candidate.priceInPaise <= upperPrice) {
        score += RELATED_PRICE_WEIGHT;
      }
      if (candidate.stockStatus === "IN_STOCK") score += RELATED_IN_STOCK_WEIGHT;
      return { candidate, score };
    })
    // Stable sort: candidates are already newest-first, so ties keep the newer piece.
    .sort((a, b) => b.score - a.score);

  let related = scored.slice(0, limit).map((entry) => entry.candidate);

  // Fallback: top up with the newest in-stock pieces when matches are sparse.
  if (related.length < RELATED_MIN_RESULTS) {
    const excludeIds = [current.id, ...related.map((item) => item.id)];
    const filler = await prisma.product.findMany({
      where: { hidden: false, id: { notIn: excludeIds } },
      orderBy: [{ stockStatus: "asc" }, { createdAt: "desc" }],
      take: limit - related.length,
      select: productListSelect
    });
    related = [...related, ...filler];
  }

  return res.json(related.map(mapProductListItem));
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
