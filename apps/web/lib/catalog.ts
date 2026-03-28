import type { CatalogProduct } from "@/lib/types";

export const catalogProducts: CatalogProduct[] = [
  {
    id: "cm0demo001",
    name: "Zari Dusk",
    description: "Handwoven silk drape with antique zari motifs for heirloom evenings.",
    longDescription:
      "Zari Dusk is crafted in rich pure silk with detailed Banarasi zari motifs and a timeless pallu drape. The fall is structured yet fluid, designed for evening receptions and heritage celebrations where elegance needs depth and presence.",
    images: [
      "https://images.unsplash.com/photo-1610189602481-8fa63f4d5f9f?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1594608661623-aa0bd3a69d98?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1623307805676-45f4db3b7898?auto=format&fit=crop&w=1400&q=80"
    ],
    fabric: "SILK",
    craft: "BANARASI",
    lengthInMeters: 5.5,
    weight: "720g",
    work: "Antique zari weave",
    colorTone: "Deep maroon with muted gold",
    care: "Dry clean only",
    occasion: "Wedding evening, reception, festive formal",
    blouseIncluded: true,
    priceInPaise: 159000,
    stockStatus: "IN_STOCK"
  },
  {
    id: "cm0demo002",
    name: "Temple Bloom",
    description: "Kanjeevaram body with rich contrast borders and timeless texture.",
    longDescription:
      "Temple Bloom celebrates South Indian weaving heritage with a dual-tone Kanjeevaram body and broad contrast temple borders. The saree is designed for ceremonial moments and portrait-worthy styling with bold jewelry.",
    images: [
      "https://images.unsplash.com/photo-1594608661623-aa0bd3a69d98?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1610189602481-8fa63f4d5f9f?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1623307805676-45f4db3b7898?auto=format&fit=crop&w=1400&q=80"
    ],
    fabric: "SILK",
    craft: "KANJEEVARAM",
    lengthInMeters: 5.5,
    weight: "790g",
    work: "Contrast zari border with temple motifs",
    colorTone: "Royal magenta with gold",
    care: "Dry clean only",
    occasion: "Wedding rituals, festive puja, grand celebrations",
    blouseIncluded: true,
    priceInPaise: 189000,
    stockStatus: "IN_STOCK"
  },
  {
    id: "cm0demo003",
    name: "Ivory Whisper",
    description: "Light chiffon drape with delicate handwork for effortless celebrations.",
    longDescription:
      "Ivory Whisper is a feather-light chiffon saree featuring subtle hand embroidery and a graceful translucent fall. It is ideal for day events, intimate functions, and modern minimalist styling.",
    images: [
      "https://images.unsplash.com/photo-1623307805676-45f4db3b7898?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1594608661623-aa0bd3a69d98?auto=format&fit=crop&w=1400&q=80",
      "https://images.unsplash.com/photo-1610189602481-8fa63f4d5f9f?auto=format&fit=crop&w=1400&q=80"
    ],
    fabric: "CHIFFON",
    craft: "CHIKANKARI",
    lengthInMeters: 5.5,
    weight: "430g",
    work: "Subtle hand embroidery",
    colorTone: "Soft ivory",
    care: "Gentle dry clean",
    occasion: "Day events, engagement brunch, elegant casual festive",
    blouseIncluded: false,
    priceInPaise: 94000,
    stockStatus: "SOLD_OUT"
  }
];

export function getProductById(id: string) {
  return catalogProducts.find((product) => product.id === id);
}
