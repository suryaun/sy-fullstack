import { notFound } from "next/navigation";
import ProductDetailClient from "@/components/ProductDetailClient";
import { catalogProducts } from "@/lib/catalog";

type ApiProductColorImage = {
  imageUrl: string;
  sortOrder?: number;
};

type ApiProductImage = {
  imageUrl: string;
  sortOrder?: number;
};

type ApiProductColor = {
  id: string;
  name: string;
  colorCode?: string | null;
  isDefault: boolean;
  stockQuantity: number;
  priceInPaise?: number | null;
  images: ApiProductColorImage[];
};

type ApiProductDetail = {
  id: string;
  name: string;
  description: string;
  fabric: string;
  craft: string;
  lengthInMeters: number;
  blouseIncluded: boolean;
  priceInPaise: number;
  stockStatus: "IN_STOCK" | "SOLD_OUT";
  images?: ApiProductImage[];
  colors: ApiProductColor[];
  defaultColorId?: string | null;
};

const INTERNAL_API_URL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000";

async function getProductFromApi(id: string): Promise<ApiProductDetail | null> {
  const response = await fetch(`${INTERNAL_API_URL}/api/products/${id}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as ApiProductDetail;
}

function mapCatalogFallback(id: string) {
  const product = catalogProducts.find((item) => item.id === id);
  if (!product) {
    return null;
  }

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    longDescription: product.longDescription,
    fabric: product.fabric,
    craft: product.craft,
    lengthInMeters: product.lengthInMeters,
    blouseIncluded: product.blouseIncluded,
    priceInPaise: product.priceInPaise,
    stockStatus: product.stockStatus,
    care: product.care,
    work: product.work,
    occasion: product.occasion,
    images: product.images.map((imageUrl, index) => ({
      imageUrl,
      sortOrder: index,
    })),
    colors: [
      {
        id: `${product.id}-default-color`,
        name: product.colorTone,
        isDefault: true,
        stockQuantity: product.stockStatus === "IN_STOCK" ? 1 : 0,
        priceInPaise: product.priceInPaise,
        images: product.images.map((imageUrl, index) => ({
          imageUrl,
          sortOrder: index,
        })),
      },
    ],
    defaultColorId: `${product.id}-default-color`,
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const apiProduct = await getProductFromApi(id);
  const product = apiProduct
    ? {
        ...apiProduct,
        longDescription: apiProduct.description,
      }
    : mapCatalogFallback(id);

  if (!product) {
    return notFound();
  }

  return <ProductDetailClient product={product} />;
}
