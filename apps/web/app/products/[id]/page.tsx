import { notFound } from "next/navigation";
import ProductDetailClient from "@/components/ProductDetailClient";

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
  categoryLabel: string | null;
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

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const apiProduct = await getProductFromApi(id);
  if (!apiProduct) {
    return notFound();
  }

  const product = {
    ...apiProduct,
    longDescription: apiProduct.description,
  };

  return <ProductDetailClient product={product} />;
}
