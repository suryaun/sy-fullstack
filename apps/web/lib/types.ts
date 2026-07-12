export type CatalogProductColorOption = {
  id?: string;
  name: string;
  colorCode?: string | null;
  isDefault?: boolean;
  stockQuantity?: number;
  priceInPaise?: number | null;
  images?: string[];
};

export type CatalogProductCategory = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
};

export type CatalogCategoryNode = CatalogProductCategory & {
  children: CatalogCategoryNode[];
};

export type CatalogProduct = {
  id: string;
  name: string;
  description: string;
  longDescription: string;
  images: string[];
  fabric: string;
  categoryLabel: string | null;
  lengthInMeters: number;
  weight: string;
  work: string;
  colorTone: string;
  availableColors?: CatalogProductColorOption[];
  care: string;
  occasion: string;
  blouseIncluded: boolean;
  priceInPaise: number;
  stockStatus: "IN_STOCK" | "SOLD_OUT";
  categories?: CatalogProductCategory[];
};
