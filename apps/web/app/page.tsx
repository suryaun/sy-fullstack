import Image from "next/image";
import BoutiqueGallery from "@/components/BoutiqueGallery";
import type { CatalogCategoryNode, CatalogProduct } from "@/lib/types";

type ApiHomeProduct = {
  id: string;
  name: string;
  description: string;
  fabric: string;
  work: string;
  occasion: string;
  care: string;
  categoryLabel: string | null;
  lengthInMeters: number;
  blouseIncluded: boolean;
  priceInPaise: number;
  originalPriceInPaise?: number | null;
  stockStatus: "IN_STOCK" | "SOLD_OUT";
  imageUrl: string | null;
  images?: Array<{ imageUrl: string; sortOrder?: number }>;
  colors?: Array<{
    id: string;
    name: string;
    colorCode?: string | null;
    isDefault: boolean;
    stockQuantity: number;
    priceInPaise?: number | null;
    originalPriceInPaise?: number | null;
    images?: Array<{ imageUrl: string; sortOrder?: number }>;
  }>;
  categories?: Array<{
    id: string;
    name: string;
    slug: string;
    parentId: string | null;
    sortOrder: number;
  }>;
};

const INTERNAL_API_URL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000";

type ApiHomeCategoryNode = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  children: ApiHomeCategoryNode[];
};

async function getHomepageProducts(): Promise<CatalogProduct[]> {
  try {
    const response = await fetch(`${INTERNAL_API_URL}/api/products`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    const apiProducts = (await response.json()) as ApiHomeProduct[];
    if (apiProducts.length === 0) {
      return [];
    }

    const mappedApiProducts = apiProducts.map((product) => {
      const imageUrls =
        product.images && product.images.length > 0
          ? product.images
              .slice()
              .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
              .map((image) => image.imageUrl)
          : product.imageUrl
            ? [product.imageUrl]
            : [];

      const availableColors =
        (product.colors ?? []).map((color) => ({
              id: color.id,
              name: color.name,
              colorCode: color.colorCode,
              isDefault: color.isDefault,
              stockQuantity: color.stockQuantity,
              priceInPaise: color.priceInPaise,
              originalPriceInPaise: color.originalPriceInPaise,
              images: (color.images ?? []).map((image) => image.imageUrl),
            }));

      const primaryColorTone =
        availableColors.find((color) => color.isDefault)?.name ??
        availableColors[0]?.name ??
        "Curated shade";

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        longDescription: product.description,
        images: imageUrls,
        fabric: product.fabric,
        categoryLabel: product.categoryLabel,
        lengthInMeters: product.lengthInMeters,
        weight: "-",
        work: product.work,
        colorTone: primaryColorTone,
        availableColors,
        care: product.care,
        occasion: product.occasion,
        blouseIncluded: product.blouseIncluded,
        priceInPaise: product.priceInPaise,
        originalPriceInPaise: product.originalPriceInPaise,
        stockStatus: product.stockStatus,
        categories: product.categories ?? [],
      };
    });

    return mappedApiProducts.filter(
      (product) => (product.availableColors?.length ?? 0) > 0,
    );
  } catch {
    return [];
  }
}

async function getHomepageCategories(): Promise<CatalogCategoryNode[]> {
  try {
    const response = await fetch(`${INTERNAL_API_URL}/api/products/categories`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    const categories = (await response.json()) as ApiHomeCategoryNode[];
    return categories;
  } catch {
    return [];
  }
}

export default async function Home() {
  const [products, categories] = await Promise.all([
    getHomepageProducts(),
    getHomepageCategories(),
  ]);

  return (
    <main>
      <header className="hero-lockup">
        {/* Logo seal */}
        <div className="hero-logo-shell">
          <div className="hero-logo-frame">
            <span className="hero-logo-mark">
              <Image
                src="/seere-yaana-logo.png"
                alt="Seere Yaana"
                fill
                className="object-cover"
                sizes="(max-width: 640px) 44vw, 300px"
                priority
              />
            </span>
          </div>
        </div>

        <div className="hero-text">
          <h1 className="font-serif text-5xl italic leading-[1.08] text-ink sm:text-6xl lg:text-7xl">
            Designed Like Couture,<br className="hidden sm:block" /> Worn Like Air.
          </h1>
          <p className="mt-7 max-w-xl text-sm leading-relaxed text-[#5c4a42] sm:text-base">
            Curated handcrafted drapes with a minimalist luxury edit — designed for
            intimate weddings, festive soirees, and statement evenings.
          </p>
        </div>
      </header>

      <BoutiqueGallery products={products} categories={categories} />

      {/* Footer seal */}
      <footer className="flex flex-col items-center gap-4 border-t border-[#e4d9d0] py-12">
        <span className="relative h-12 w-12 overflow-hidden rounded-full opacity-70 ring-1 ring-[#e4d9d0]">
          <Image
            src="/seere-yaana-logo.png"
            alt="Seere Yaana"
            fill
            className="object-cover"
            sizes="48px"
          />
        </span>
        <p className="text-xs uppercase tracking-[0.3em] text-[#7a6050]">
          Seere Yaana · Handcrafted Luxury
        </p>
      </footer>
    </main>
  );
}
