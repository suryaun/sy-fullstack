import BoutiqueGallery from "@/components/BoutiqueGallery";
import { catalogProducts } from "@/lib/catalog";
import type { CatalogProduct } from "@/lib/types";

type ApiHomeProduct = {
  id: string;
  name: string;
  description: string;
  fabric: string;
  craft: string;
  lengthInMeters: number;
  blouseIncluded: boolean;
  priceInPaise: number;
  stockStatus: "IN_STOCK" | "SOLD_OUT";
  imageUrl: string;
  images?: Array<{ imageUrl: string; sortOrder?: number }>;
};

const INTERNAL_API_URL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000";

async function getHomepageProducts(): Promise<CatalogProduct[]> {
  try {
    const response = await fetch(`${INTERNAL_API_URL}/api/products`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return catalogProducts;
    }

    const apiProducts = (await response.json()) as ApiHomeProduct[];
    if (apiProducts.length === 0) {
      return catalogProducts;
    }

    const mappedApiProducts = apiProducts.map((product) => {
      const imageUrls =
        product.images && product.images.length > 0
          ? product.images
              .slice()
              .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
              .map((image) => image.imageUrl)
          : [product.imageUrl];

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        longDescription: product.description,
        images: imageUrls,
        fabric: product.fabric,
        craft: product.craft,
        lengthInMeters: product.lengthInMeters,
        weight: "-",
        work: "Curated handcrafted detailing",
        colorTone: "Curated shade",
        care: "Dry clean only",
        occasion: "Festive and occasion wear",
        blouseIncluded: product.blouseIncluded,
        priceInPaise: product.priceInPaise,
        stockStatus: product.stockStatus,
      };
    });

    // Keep catalog coverage while prioritizing live API records for matching IDs.
    const mergedById = new Map<string, CatalogProduct>();
    for (const product of catalogProducts) {
      mergedById.set(product.id, product);
    }
    for (const product of mappedApiProducts) {
      mergedById.set(product.id, product);
    }

    return Array.from(mergedById.values());
  } catch {
    return catalogProducts;
  }
}

export default async function Home() {
  const products = await getHomepageProducts();

  return (
    <main>
      <header className="mx-auto max-w-6xl px-6 pb-6 pt-14 text-center">
        <p className="mb-3 text-xs uppercase tracking-[0.35em] text-[#6A1F2B]">
          Seere Yaana
        </p>
        <h1 className="font-serif text-5xl leading-tight text-ink sm:text-6xl">
          Modern Heirlooms in Every Drape
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-sm text-[#5b5149] sm:text-base">
          Curated handcrafted drapes with a minimalist luxury edit designed for
          intimate weddings, festive soirees, and statement evenings.
        </p>
      </header>

      <BoutiqueGallery products={products} />
    </main>
  );
}
