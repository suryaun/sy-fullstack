export type CatalogProduct = {
  id: string;
  name: string;
  description: string;
  longDescription: string;
  images: string[];
  fabric: string;
  craft: string;
  lengthInMeters: number;
  weight: string;
  work: string;
  colorTone: string;
  care: string;
  occasion: string;
  blouseIncluded: boolean;
  priceInPaise: number;
  stockStatus: "IN_STOCK" | "SOLD_OUT";
};
