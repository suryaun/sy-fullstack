"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { CatalogCategoryNode, CatalogProduct } from "@/lib/types";
import { useStore } from "@/components/StoreProvider";

type Props = {
  products: CatalogProduct[];
  categories: CatalogCategoryNode[];
};

type CategoryFilterOption = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
};

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=1200&q=80";

const SWATCH_FALLBACKS = [
  "#6A1F2B",
  "#A36B55",
  "#4D5C6F",
  "#6B7A56",
  "#D0B28B",
  "#8A6E7D",
];

function resolveSwatchColor(code: string | null | undefined, seed: string) {
  if (code && /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(code.trim())) {
    return code.trim();
  }

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index);
    hash |= 0;
  }

  const paletteIndex = Math.abs(hash) % SWATCH_FALLBACKS.length;
  return SWATCH_FALLBACKS[paletteIndex];
}

function conciseDescription(text: string, maxLength = 92) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}...`;
}

export default function BoutiqueGallery({ products, categories }: Props) {
  const { addToCart, toggleWishlist, isWishlisted, cartItems, cartCount } =
    useStore();
  const router = useRouter();
  const pathname = usePathname();
  const [selectedCategoryPathToken, setSelectedCategoryPathToken] =
    useState<string | null>(null);
  const [isCategoryPanelOpen, setIsCategoryPanelOpen] = useState(true);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<string[]>([]);
  const [selectedColorByProductId, setSelectedColorByProductId] = useState<Record<string, string>>({});

  useEffect(() => {
    const syncFromLocation = () => {
      if (typeof window === "undefined") {
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const nextToken = params.get("categoryPath")?.trim() || null;
      setSelectedCategoryPathToken(nextToken);
    };

    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);

    return () => {
      window.removeEventListener("popstate", syncFromLocation);
    };
  }, []);

  const categoryFilterData = useMemo(() => {
    const categoryById = new Map<string, CategoryFilterOption>();
    const parentById = new Map<string, string | null>();
    const childrenById = new Map<string, string[]>();
    const rootIds: string[] = [];

    const registerNode = (
      node: CatalogCategoryNode,
      parentId: string | null,
    ) => {
      categoryById.set(node.id, {
        id: node.id,
        name: node.name,
        slug: node.slug,
        parentId,
        sortOrder: node.sortOrder,
      });
      parentById.set(node.id, parentId);

      if (parentId) {
        const siblings = childrenById.get(parentId) ?? [];
        siblings.push(node.id);
        childrenById.set(parentId, siblings);
      } else {
        rootIds.push(node.id);
      }

      for (const child of node.children ?? []) {
        registerNode(child, node.id);
      }
    };

    for (const rootNode of categories) {
      registerNode(rootNode, null);
    }

    const sortCategoryIds = (ids: string[]) =>
      ids.sort((leftId, rightId) => {
        const left = categoryById.get(leftId);
        const right = categoryById.get(rightId);

        if (!left || !right) {
          return leftId.localeCompare(rightId);
        }

        return (
          left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)
        );
      });

    sortCategoryIds(rootIds);
    for (const [parentId, childIds] of childrenById.entries()) {
      childrenById.set(parentId, sortCategoryIds(childIds));
    }

    const descendantsByCategoryId = new Map<string, Set<string>>();
    const collectDescendants = (categoryId: string): Set<string> => {
      const cached = descendantsByCategoryId.get(categoryId);
      if (cached) {
        return cached;
      }

      const collected = new Set<string>([categoryId]);
      for (const childId of childrenById.get(categoryId) ?? []) {
        for (const descendantId of collectDescendants(childId)) {
          collected.add(descendantId);
        }
      }

      descendantsByCategoryId.set(categoryId, collected);
      return collected;
    };

    for (const categoryId of categoryById.keys()) {
      collectDescendants(categoryId);
    }

    const productCountByCategoryId = new Map<string, number>();
    for (const categoryId of categoryById.keys()) {
      const eligibleCategoryIds =
        descendantsByCategoryId.get(categoryId) ?? new Set([categoryId]);

      let productCount = 0;
      for (const product of products) {
        const productCategoryIds = (product.categories ?? []).map(
          (category) => category.id,
        );
        if (
          productCategoryIds.some((productCategoryId) =>
            eligibleCategoryIds.has(productCategoryId),
          )
        ) {
          productCount += 1;
        }
      }

      productCountByCategoryId.set(categoryId, productCount);
    }

    return {
      categoryById,
      parentById,
      childrenById,
      rootIds,
      descendantsByCategoryId,
      productCountByCategoryId,
    };
  }, [categories, products]);

  const selectedCategoryId = useMemo(() => {
    if (!selectedCategoryPathToken) {
      return "all";
    }

    const pathNames = selectedCategoryPathToken
      .split("/")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (pathNames.length === 0) {
      return "all";
    }

    const normalize = (value: string) => value.trim().toLowerCase();

    let candidateIds = categoryFilterData.rootIds.filter((rootId) => {
      const category = categoryFilterData.categoryById.get(rootId);
      return (
        category !== undefined && normalize(category.name) === normalize(pathNames[0] ?? "")
      );
    });

    if (candidateIds.length === 0) {
      return "all";
    }

    for (let index = 1; index < pathNames.length; index += 1) {
      const targetName = normalize(pathNames[index] ?? "");
      const nextCandidates: string[] = [];

      for (const candidateId of candidateIds) {
        const childIds = categoryFilterData.childrenById.get(candidateId) ?? [];
        for (const childId of childIds) {
          const childCategory = categoryFilterData.categoryById.get(childId);
          if (!childCategory) {
            continue;
          }

          if (normalize(childCategory.name) === targetName) {
            nextCandidates.push(childId);
          }
        }
      }

      candidateIds = nextCandidates;
      if (candidateIds.length === 0) {
        return "all";
      }
    }

    // If the name path is ambiguous, keep behavior strict and do not select.
    if (candidateIds.length !== 1) {
      return "all";
    }

    return candidateIds[0] ?? "all";
  }, [
    categoryFilterData.categoryById,
    categoryFilterData.childrenById,
    categoryFilterData.parentById,
    categoryFilterData.rootIds,
    selectedCategoryPathToken,
  ]);

  useEffect(() => {
    if (selectedCategoryId === "all") {
      return;
    }

    const ancestorIds: string[] = [];
    let cursor = categoryFilterData.parentById.get(selectedCategoryId) ?? null;

    while (cursor) {
      ancestorIds.push(cursor);
      cursor = categoryFilterData.parentById.get(cursor) ?? null;
    }

    if (ancestorIds.length === 0) {
      return;
    }

    setExpandedCategoryIds((previous) => {
      const next = new Set(previous);
      for (const ancestorId of ancestorIds) {
        next.add(ancestorId);
      }

      return [...next];
    });
  }, [categoryFilterData.parentById, selectedCategoryId]);

  const applyCategoryFilter = (nextCategoryId: string) => {
    if (typeof window === "undefined") {
      return;
    }

    const nextParams = new URLSearchParams(window.location.search);

    if (nextCategoryId === "all") {
      nextParams.delete("categoryPath");
      setSelectedCategoryPathToken(null);
    } else {
      const category =
        categoryFilterData.categoryById.get(nextCategoryId) ?? null;
      if (!category || !categoryFilterData.categoryById.has(nextCategoryId)) {
        return;
      }

      const pathNames: string[] = [];
      let cursor: string | null = nextCategoryId;

      while (cursor) {
        const cursorCategory = categoryFilterData.categoryById.get(cursor);
        if (!cursorCategory) {
          return;
        }

        pathNames.push(cursorCategory.name);
        cursor = categoryFilterData.parentById.get(cursor) ?? null;
      }

      pathNames.reverse();
      const pathValue = pathNames.join("/");

      nextParams.set("categoryPath", pathValue);
      setSelectedCategoryPathToken(pathValue);
    }

    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    });
  };

  const filteredProducts = useMemo(() => {
    if (selectedCategoryId === "all") {
      return products;
    }

    const eligibleCategoryIds =
      categoryFilterData.descendantsByCategoryId.get(selectedCategoryId);

    if (!eligibleCategoryIds) {
      return products;
    }

    return products.filter((product) =>
      (product.categories ?? []).some((category) =>
        eligibleCategoryIds.has(category.id),
      ),
    );
  }, [categoryFilterData.descendantsByCategoryId, products, selectedCategoryId]);

  const totalCategoryProducts = products.length;

  const expandedCategoryIdSet = useMemo(
    () => new Set(expandedCategoryIds),
    [expandedCategoryIds],
  );

  const expandCategoryBranch = (categoryId: string) => {
    setExpandedCategoryIds((previous) => {
      const next = new Set(previous);
      next.add(categoryId);

      return [...next];
    });
  };

  const collapseCategoryBranch = (categoryId: string) => {
    const descendants = categoryFilterData.descendantsByCategoryId.get(categoryId);
    if (!descendants) {
      return;
    }

    setExpandedCategoryIds((previous) =>
      previous.filter((expandedId) => !descendants.has(expandedId)),
    );
  };

  const onCategoryNodeClick = (categoryId: string, hasChildren: boolean) => {
    const isExpanded = expandedCategoryIdSet.has(categoryId);

    if (hasChildren) {
      if (!isExpanded) {
        expandCategoryBranch(categoryId);
        applyCategoryFilter(categoryId);
        return;
      }

      if (selectedCategoryId !== categoryId) {
        // When navigating up from a child, move selection to this parent node.
        applyCategoryFilter(categoryId);
        return;
      }

      if (isExpanded) {
        collapseCategoryBranch(categoryId);
        applyCategoryFilter("all");
        return;
      }
    }

    if (selectedCategoryId === categoryId) {
      applyCategoryFilter("all");
      return;
    }

    applyCategoryFilter(categoryId);
  };

  const renderCategoryTree = (categoryIds: string[], depth = 0) =>
    categoryIds
      .map((categoryId) => {
        const category = categoryFilterData.categoryById.get(categoryId);
        if (!category) {
          return null;
        }

        const childIds = categoryFilterData.childrenById.get(categoryId) ?? [];
        const hasChildren = childIds.length > 0;
        const isExpanded = expandedCategoryIdSet.has(category.id);
        const isSelected = selectedCategoryId === category.id;
        const productCount =
          categoryFilterData.productCountByCategoryId.get(category.id) ?? 0;

        return (
          <div key={category.id} className={depth > 0 ? "mt-1" : ""}>
            <button
              type="button"
              onClick={() => onCategoryNodeClick(category.id, hasChildren)}
              className={`flex w-full min-w-0 items-center justify-between rounded px-2.5 py-2 text-left text-xs tracking-wide transition ${
                isSelected
                  ? "bg-ink text-[#faf8f5]"
                  : "bg-[#f5f1eb] text-[#5c4e44] hover:bg-[#ede7df]"
              }`}
              style={{ marginLeft: `${depth * 8}px` }}
            >
              <span className="truncate">{category.name}</span>
              <span className="ml-2 shrink-0 opacity-60">{productCount}</span>
            </button>

            {hasChildren && isExpanded ? (
              <div className="ml-4 border-l border-[#e4d9d0] pl-2">
                {renderCategoryTree(childIds, depth + 1)}
              </div>
            ) : null}
          </div>
        );
      })
      .filter((node) => node !== null);

  return (
    <section id="collection" className="mx-auto max-w-7xl px-5 pb-20 pt-8 sm:px-8 sm:pt-12">
      {cartCount > 0 ? (
        <div className="mb-6 flex justify-end">
          <Link
            href="/checkout"
            className="apple-button-primary rounded-sm px-6 py-2.5 text-[11px] uppercase tracking-[0.18em]"
          >
            Checkout ({cartCount})
          </Link>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="apple-tile h-fit rounded-lg p-5">
          <button
            type="button"
            onClick={() => setIsCategoryPanelOpen((previous) => !previous)}
            className="flex w-full items-center justify-between text-left"
            aria-expanded={isCategoryPanelOpen}
          >
            <h2 className="text-xs font-medium uppercase tracking-[0.25em] text-[#5c4a42]">
              Browse
            </h2>
            <span className="text-xs text-[#7a6050]">
              {isCategoryPanelOpen ? "−" : "+"}
            </span>
          </button>

          {isCategoryPanelOpen ? (
            <div className="mt-3 space-y-1.5">
              <button
                type="button"
                onClick={() => applyCategoryFilter("all")}
                className={`w-full rounded px-2.5 py-2 text-left text-xs tracking-wide transition ${
                  selectedCategoryId === "all"
                    ? "bg-ink text-[#faf8f5]"
                    : "bg-[#f5f1eb] text-[#5c4e44] hover:bg-[#ede7df]"
                }`}
              >
                All ({totalCategoryProducts})
              </button>

              {categoryFilterData.rootIds.length === 0 ? (
                <p className="rounded px-2.5 py-2 text-xs text-[#5c4a42]">
                  No categories yet.
                </p>
              ) : (
                <div className="space-y-1">
                  {renderCategoryTree(categoryFilterData.rootIds)}
                </div>
              )}
            </div>
          ) : null}
        </aside>

        <div>
          {filteredProducts.length === 0 ? (
            <div className="rounded border border-dashed border-[#e4d9d0] bg-[#faf8f5] p-10 text-center text-sm text-[#5c4a42]">
              No pieces found for this category.
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {filteredProducts.map((product, index) => {
        const validImages = product.images.filter(
          (image) => typeof image === "string" && image.trim().length > 0,
        );
        const swatches =
          product.availableColors && product.availableColors.length > 0
            ? product.availableColors.map((color) => ({
                id: color.id ?? `${product.id}-${color.name}`,
                name: color.name,
                colorCode: resolveSwatchColor(
                  color.colorCode,
                  `${product.id}-${color.name}`,
                ),
              }))
            : [
                {
                  id: `${product.id}-tone`,
                  name: product.colorTone,
                  colorCode: resolveSwatchColor(null, `${product.id}-${product.colorTone}`),
                },
              ];

        const quickAddColorId =
          selectedColorByProductId[product.id] ??
          product.availableColors?.find(
            (color) =>
              color.isDefault &&
              color.id &&
              (color.stockQuantity ?? 0) > 0,
          )?.id ??
          product.availableColors?.find(
            (color) => color.id && (color.stockQuantity ?? 0) > 0,
          )?.id ??
          product.availableColors?.find((color) => color.isDefault && color.id)
            ?.id ??
          product.availableColors?.find((color) => color.id)?.id;
        const quickAddColor = product.availableColors?.find(
          (color) => color.id === quickAddColorId,
        );
        
        // Use color-specific images if available, otherwise use product images
        const imagesToUse = quickAddColor?.images && quickAddColor.images.length > 0
          ? quickAddColor.images
          : validImages;
        const primaryImage = imagesToUse[0] ?? FALLBACK_IMAGE;
        const secondaryImage = imagesToUse[1] ?? primaryImage;
        
        const quickAddStock = quickAddColor?.stockQuantity ?? 0;
        const bagQuantity = quickAddColorId
          ? (cartItems.find(
              (item) =>
                item.productId === product.id && item.colorId === quickAddColorId,
            )?.quantity ?? 0)
          : 0;
        const isQuickAddAvailable =
          product.stockStatus === "IN_STOCK" && quickAddStock > 0;
        const isVariantWishlisted = isWishlisted(product.id, quickAddColorId);
        const categoryNames = (product.categories ?? [])
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
          .map((category) => category.name)
          .slice(0, 2);

        return (
          <Link
            key={product.id}
            href={`/products/${product.id}${quickAddColorId ? `?color=${quickAddColorId}` : ''}`}
            className="apple-tile group animate-rise overflow-hidden rounded-lg transition-all duration-500 hover:-translate-y-1 block"
            style={{ animationDelay: `${index * 80}ms` }}
            aria-label={`View details for ${product.name}`}
          >
            <article className="relative block h-96 w-full overflow-hidden">
              <Image
                src={primaryImage}
                alt={product.name}
                width={1200}
                height={1600}
                className="absolute inset-0 h-full w-full object-cover transition-all duration-700 ease-out group-hover:scale-[1.03] group-hover:opacity-0"
                sizes="(max-width: 768px) 100vw, 33vw"
                unoptimized
                priority={index < 2}
              />
              <Image
                src={secondaryImage}
                alt={`${product.name} alternate view`}
                width={1200}
                height={1600}
                className="absolute inset-0 h-full w-full scale-[1.04] object-cover opacity-0 transition-all duration-700 ease-out group-hover:scale-100 group-hover:opacity-100"
                sizes="(max-width: 768px) 100vw, 33vw"
                unoptimized
                aria-hidden
              />
            </article>

            <div className="space-y-3 p-5">
              <p className="text-xs uppercase tracking-[0.22em] text-[#7a6050]">
                {product.fabric}{product.craft ? ` · ${product.craft}` : ""}
              </p>
              {categoryNames.length > 0 ? (
                <p className="text-xs uppercase tracking-[0.18em] text-[#8a6e60]">
                  {categoryNames.join(" · ")}
                </p>
              ) : null}
              <h3 className="font-serif text-2xl leading-tight text-ink">
                {product.name}
              </h3>
              <p className="min-h-[2.5rem] text-sm leading-relaxed text-[#5c4a42]">
                {conciseDescription(product.description)}
              </p>

              <div className="flex items-center justify-between">
                <p className="font-serif text-xl text-ink">
                  ₹{(product.priceInPaise / 100).toLocaleString("en-IN")}
                </p>
              </div>

              <p className="text-xs uppercase tracking-[0.18em] text-[#7a6050]">
                Blouse {product.blouseIncluded ? "Included" : "Optional"}
              </p>

              <div className="flex flex-wrap gap-2 pt-1">
                <div className="flex flex-col gap-2 w-full">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-[#7a6050] font-medium">Select Colour</p>
                  <div className="flex flex-wrap gap-1.5">
                    {product.availableColors?.map((color) => {
                      const isSelected = color.id === quickAddColorId;
                      const isAvailable = (color.stockQuantity ?? 0) > 0;
                      return (
                        <button
                          key={color.id}
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (color.id) {
                              setSelectedColorByProductId(prev => ({ ...prev, [product.id]: color.id! }));
                            }
                          }}
                          title={color.name}
                          className={`relative h-6 w-6 rounded-full border-2 transition ${ isSelected
                            ? "border-ink shadow-md scale-110"
                            : "border-white/50 hover:border-[#d0d0d0]"
                          } ${!isAvailable ? "opacity-40" : "cursor-pointer"}`}
                          style={{
                            backgroundColor: resolveSwatchColor(
                              color.colorCode,
                              `${product.id}-${color.name}`,
                            ),
                          }}
                          aria-label={`${color.name}${isAvailable ? "" : " (out of stock)"}`}
                        />
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleWishlist(product.id, quickAddColorId);
                  }}
                  aria-pressed={isVariantWishlisted}
                  className={`inline-flex items-center gap-1.5 rounded-sm border px-4 py-2.5 text-[11px] uppercase tracking-[0.18em] transition ${
                    isVariantWishlisted
                      ? "border-ink bg-ink text-[#faf8f5]"
                      : "border-[#e4d9d0] bg-white text-[#5c4e44] hover:border-[#c5b9ae]"
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill={isVariantWishlisted ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="M12 20s-6.7-4.4-9-8.2C1.2 9 2.4 5.9 5.4 5a5.2 5.2 0 0 1 5 1.4L12 8l1.6-1.6a5.2 5.2 0 0 1 5-1.4c3 .9 4.2 4 2.4 6.8-2.3 3.8-9 8.2-9 8.2Z" />
                  </svg>
                  <span>{isVariantWishlisted ? "Wishlisted" : "Wishlist"}</span>
                </button>

                {bagQuantity > 0 ? (
                  <div className="flex items-center gap-2 rounded-sm border border-[#e4d9d0] bg-[#f5f1eb] px-3 py-2.5 text-[11px] uppercase tracking-[0.12em] text-ink">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <path d="M6.5 9h11l-1.1 9a2 2 0 0 1-2 1.8H9.6a2 2 0 0 1-2-1.8L6.5 9Z" />
                      <path d="M9 9V7a3 3 0 1 1 6 0v2" />
                    </svg>
                    <span>Bag {bagQuantity}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!quickAddColorId) {
                          return;
                        }

                        addToCart(product.id, quickAddColorId, -1);
                      }}
                      className="rounded-sm border border-[#e4d9d0] bg-white px-2 py-0.5 text-xs"
                      aria-label="Decrease bag quantity"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!quickAddColorId) {
                          return;
                        }

                        addToCart(product.id, quickAddColorId, 1);
                      }}
                      disabled={
                        !quickAddColorId ||
                        !isQuickAddAvailable ||
                        bagQuantity >= quickAddStock
                      }
                      className="rounded-sm border border-[#e4d9d0] bg-white px-2 py-0.5 text-xs disabled:opacity-40"
                      aria-label="Increase bag quantity"
                    >
                      +
                    </button>
                  </div>
                ) : isQuickAddAvailable ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!quickAddColorId) {
                        return;
                      }

                      addToCart(product.id, quickAddColorId, 1);
                    }}
                    className="apple-button-secondary rounded-sm px-4 py-2.5 text-[11px] uppercase tracking-[0.18em]"
                  >
                    Add to Bag
                  </button>
                ) : quickAddColorId ? (
                  <button
                    type="button"
                    disabled
                    className="border border-[#e4d9d0] rounded-sm px-4 py-2.5 text-[11px] uppercase tracking-[0.18em] text-[#5c4e44] opacity-50"
                  >
                    Notify Me
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="border border-[#e4d9d0] rounded-sm px-4 py-2.5 text-[11px] uppercase tracking-[0.18em] text-[#5c4e44] opacity-50"
                  >
                    Select Color
                  </button>
                )}
              </div>
            </div>
          </Link>
        );
      })}
          </div>
        </div>
      </div>
    </section>
  );
}
