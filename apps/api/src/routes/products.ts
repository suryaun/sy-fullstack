import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();

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
