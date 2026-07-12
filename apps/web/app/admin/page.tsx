"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import ColorPickerInput from "@/components/ColorPickerInput";

type StockState = "IN_STOCK" | "SOLD_OUT";

type AdminImage = {
  id: string;
  imageUrl: string;
  sortOrder: number;
};

type AdminColor = {
  id: string;
  name: string;
  sku?: string;
  borderColorName?: string;
  stockQuantity: number;
  isDefault: boolean;
  priceInPaise: number | null;
  originalPriceInPaise: number | null;
  images?: AdminImage[];
};

type AdminPiece = {
  id: string;
  serial: string;
  pieceNumber: number;
  status: "AVAILABLE" | "SOLD" | "RETURNED" | "REMOVED";
  allocatedOrderItemId: string | null;
};

type AdminOrderItem = {
  id: string;
  quantity: number;
  priceAtTime: number;
  hsnCode: string | null;
  gstRatePercent: number;
  taxableAmountInPaise: number;
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
  product: { id: string; name: string };
  productColor: { id: string; name: string; sku: string | null } | null;
};

type AdminOrder = {
  id: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  status: "PENDING" | "PAID" | "FAILED" | "CANCELLED";
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryState: string | null;
  amountInPaise: number;
  taxableAmountInPaise: number;
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
  createdAt: string;
  items: AdminOrderItem[];
};

type GstB2csRow = {
  placeOfSupply: string;
  gstRatePercent: number;
  taxableAmountInPaise: number;
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
  invoiceCount: number;
};

type AdminGstReport = {
  month: string;
  invoiceCount: number;
  b2cs: GstB2csRow[];
  totals: {
    taxableAmountInPaise: number;
    cgstInPaise: number;
    sgstInPaise: number;
    igstInPaise: number;
    grandTotalInPaise: number;
  };
  invoices: AdminOrder[];
};

type AdminProductCategory = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
};

type AdminCategoryNode = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  children: AdminCategoryNode[];
};

type FlatCategoryOption = {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
};
type ProductOptionType = "WORK" | "OCCASION" | "CARE";

type AdminProductOption = {
  id: string;
  type: ProductOptionType;
  name: string;
  sortOrder: number;
};

type AdminProduct = {
  id: string;
  name: string;
  stockStatus: StockState;
  work: string;
  occasion: string;
  care: string;
  priceInPaise: number;
  originalPriceInPaise: number | null;
  images?: AdminImage[];
  colors: AdminColor[];
  categories: AdminProductCategory[];
};

type ProductForm = {
  name: string;
  description: string;
  fabricCategoryId: string;
  lengthInMeters: string;
  blouseIncluded: boolean;
  work: string;
  occasion: string;
  care: string;
  priceInInr: string;
  originalPriceInInr: string;
  basePriceInInr: string;
  expensesInInr: string;
  expectedNetMarginPercent: string;
  categoryIds: string[];
};

type ColorForm = {
  productId: string;
  name: string;
  colorCode: string;
  borderColorName: string;
  borderColorCode: string;
  stockQuantity: string;
  priceInInr: string;
  originalPriceInInr: string;
  isDefault: boolean;
};

type AdminTab = "overview" | "add-product" | "add-color" | "inventory" | "general-info" | "pieces" | "orders";

const ADMIN_TABS: AdminTab[] = [
  "overview",
  "add-product",
  "add-color",
  "inventory",
  "general-info",
  "pieces",
  "orders",
];

const PRODUCT_OPTION_LABELS: Record<ProductOptionType, string> = {
  WORK: "Work",
  OCCASION: "Occasion",
  CARE: "Care",
};

function getAdminTabFromPathname(pathname: string): AdminTab {
  const tab = pathname.split("/")[2];
  return ADMIN_TABS.includes(tab as AdminTab) ? (tab as AdminTab) : "overview";
}

function flattenCategoryTree(
  nodes: AdminCategoryNode[],
  depth = 0,
): FlatCategoryOption[] {
  return nodes.flatMap((node) => [
    { id: node.id, name: node.name, parentId: node.parentId, depth },
    ...flattenCategoryTree(node.children, depth + 1),
  ]);
}

function buildCategoryHierarchyMaps(flatCategories: FlatCategoryOption[]) {
  const parentById = new Map<string, string | null>();
  const childrenById = new Map<string, string[]>();

  for (const category of flatCategories) {
    parentById.set(category.id, category.parentId);
    if (category.parentId) {
      const children = childrenById.get(category.parentId) ?? [];
      children.push(category.id);
      childrenById.set(category.parentId, children);
    }
  }

  const ancestorIdsById = new Map<string, string[]>();
  const descendantIdsById = new Map<string, string[]>();

  const collectAncestors = (categoryId: string): string[] => {
    const cached = ancestorIdsById.get(categoryId);
    if (cached) {
      return cached;
    }

    const ancestors: string[] = [];
    let cursor = parentById.get(categoryId) ?? null;

    while (cursor) {
      ancestors.push(cursor);
      cursor = parentById.get(cursor) ?? null;
    }

    ancestorIdsById.set(categoryId, ancestors);
    return ancestors;
  };

  const collectDescendants = (categoryId: string): string[] => {
    const cached = descendantIdsById.get(categoryId);
    if (cached) {
      return cached;
    }

    const descendants: string[] = [];
    for (const childId of childrenById.get(categoryId) ?? []) {
      descendants.push(childId);
      descendants.push(...collectDescendants(childId));
    }

    descendantIdsById.set(categoryId, descendants);
    return descendants;
  };

  for (const category of flatCategories) {
    collectAncestors(category.id);
    collectDescendants(category.id);
  }

  return {
    ancestorIdsById,
    descendantIdsById,
  };
}

type CategoryTreeSelectorProps = {
  nodes: AdminCategoryNode[];
  selectedCategoryIds: string[];
  onToggle: (categoryId: string, checked: boolean) => void;
  disabled?: boolean;
};

function CategoryTreeSelector({
  nodes,
  selectedCategoryIds,
  onToggle,
  disabled = false,
}: CategoryTreeSelectorProps) {
  const selectedIdSet = new Set(selectedCategoryIds);

  const renderNodes = (items: AdminCategoryNode[], level: number) => {
    if (items.length === 0) {
      return null;
    }

    return (
      <div
        className={
          level === 0
            ? "space-y-1"
            : "mt-1 space-y-1 border-l border-[#eadfce] pl-3"
        }
      >
        {items.map((node) => {
          const selected = selectedIdSet.has(node.id);

          return (
            <div key={node.id}>
              <label
                className={`flex items-center gap-2 rounded-md px-2 py-1 text-xs transition ${
                  selected
                    ? "border border-[#e4c7cc] bg-[#fef2f4] text-[#6a1f2b]"
                    : "border border-transparent bg-white text-[#5b5149]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={disabled}
                  onChange={(event) => onToggle(node.id, event.target.checked)}
                />
                <span className="font-medium">{node.name}</span>
                {node.children.length > 0 ? (
                  <span className="text-[10px] uppercase tracking-[0.12em] text-[#8a7a69]">
                    Parent
                  </span>
                ) : null}
              </label>
              {renderNodes(node.children, level + 1)}
            </div>
          );
        })}
      </div>
    );
  };

  return renderNodes(nodes, 0);
}

const ADMIN_UPLOAD_MAX_DIMENSION = 2200;
const ADMIN_UPLOAD_TARGET_BYTES = 4 * 1024 * 1024;
const ADMIN_UPLOAD_MIN_QUALITY = 0.62;
const ADMIN_PROXY_BASE = "/api/admin/proxy";

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items;
  }

  const next = items.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read selected image"));
    };

    img.src = url;
  });
}

async function optimizeImageForUpload(file: File) {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  const sourceImage = await loadImageFromFile(file);
  const largestSide = Math.max(sourceImage.width, sourceImage.height);
  const scale =
    largestSide > ADMIN_UPLOAD_MAX_DIMENSION
      ? ADMIN_UPLOAD_MAX_DIMENSION / largestSide
      : 1;
  const targetWidth = Math.max(1, Math.round(sourceImage.width * scale));
  const targetHeight = Math.max(1, Math.round(sourceImage.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    return file;
  }

  context.drawImage(sourceImage, 0, 0, targetWidth, targetHeight);

  let quality = 0.86;
  let blob = await canvasToBlob(canvas, "image/jpeg", quality);
  if (!blob) {
    return file;
  }

  while (
    blob.size > ADMIN_UPLOAD_TARGET_BYTES &&
    quality > ADMIN_UPLOAD_MIN_QUALITY
  ) {
    quality = Math.max(ADMIN_UPLOAD_MIN_QUALITY, quality - 0.08);
    const nextBlob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (!nextBlob) {
      break;
    }
    blob = nextBlob;
  }

  if (blob.size >= file.size && file.size <= ADMIN_UPLOAD_TARGET_BYTES) {
    return file;
  }

  const fileName = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${fileName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

export default function AdminPage() {
  const pathname = usePathname();
  const router = useRouter();
  const previewUrlCacheRef = useRef<Map<File, string>>(new Map());
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<AdminCategoryNode[]>([]);
  const [productOptions, setProductOptions] = useState<AdminProductOption[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [stockUpdatingId, setStockUpdatingId] = useState<string | null>(null);
  const [defaultUpdatingId, setDefaultUpdatingId] = useState<string | null>(
    null,
  );
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryDeletingId, setCategoryDeletingId] = useState<string | null>(null);
    const [productOptionSaving, setProductOptionSaving] = useState(false);
    const [productOptionDeletingId, setProductOptionDeletingId] = useState<string | null>(null);
  const [productCategorySavingId, setProductCategorySavingId] = useState<
    string | null
  >(null);
  const [appendProductLoadingId, setAppendProductLoadingId] = useState<
    string | null
  >(null);
  const [appendColorLoadingId, setAppendColorLoadingId] = useState<
    string | null
  >(null);
  const [reorderProductLoadingId, setReorderProductLoadingId] = useState<
    string | null
  >(null);
  const [reorderColorLoadingId, setReorderColorLoadingId] = useState<
    string | null
  >(null);
  const [colorSubmitting, setColorSubmitting] = useState(false);
  const [productImageFiles, setProductImageFiles] = useState<File[]>([]);
  const [colorImageFiles, setColorImageFiles] = useState<File[]>([]);
  const [appendProductFiles, setAppendProductFiles] = useState<
    Record<string, File[]>
  >({});
  const [appendColorFiles, setAppendColorFiles] = useState<
    Record<string, File[]>
  >({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [form, setForm] = useState<ProductForm>({
    name: "",
    description: "",
    fabricCategoryId: "",
    lengthInMeters: "6.2",
    blouseIncluded: true,
    work: "Handcrafted",
    occasion: "Festive & occasion wear",
    care: "Dry clean only",
    priceInInr: "",
    originalPriceInInr: "",
    basePriceInInr: "",
    expensesInInr: "200",
    expectedNetMarginPercent: "35",
    categoryIds: [],
  });
  const [colorForm, setColorForm] = useState<ColorForm>({
    productId: "",
    name: "",
    colorCode: "",
    borderColorName: "",
    borderColorCode: "",
    stockQuantity: "0",
    priceInInr: "",
    originalPriceInInr: "",
    isDefault: false,
  });
  const [activeTab, setActiveTab] = useState<AdminTab>(() => getAdminTabFromPathname(pathname));
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [inventoryFilter, setInventoryFilter] = useState<
    "ALL" | "IN_STOCK" | "SOLD_OUT"
  >("ALL");
  const [categoryForm, setCategoryForm] = useState<{
    name: string;
    parentId: string;
  }>({
    name: "",
    parentId: "",
  });
  const [productOptionForm, setProductOptionForm] = useState<{
    type: ProductOptionType;
    name: string;
  }>({
    type: "WORK",
    name: "",
  });

  useEffect(() => {
    setActiveTab(getAdminTabFromPathname(pathname));
  }, [pathname]);

  const selectAdminTab = (tab: AdminTab) => {
    router.push(tab === "overview" ? "/admin" : `/admin/${tab}`);
  };

  // Pieces tab state
  const [piecesProductId, setPiecesProductId] = useState("");
  const [piecesColorId, setPiecesColorId] = useState("");
  const [pieces, setPieces] = useState<AdminPiece[]>([]);
  const [piecesSku, setPiecesSku] = useState<string | null>(null);
  const [piecesLoading, setPiecesLoading] = useState(false);

  // Orders / GST tab state
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [gstMonth, setGstMonth] = useState("");
  const [gstReport, setGstReport] = useState<AdminGstReport | null>(null);
  const [gstReportLoading, setGstReportLoading] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Product management state
  const [restockingColorId, setRestockingColorId] = useState<string | null>(null);
  const [restockQuantity, setRestockQuantity] = useState("");
  const [hideDeleteConfirmProductId, setHideDeleteConfirmProductId] = useState<string | null>(null);
  const [hideDeleteAction, setHideDeleteAction] = useState<"hide" | "delete" | null>(null);

  const flatCategories = useMemo(
    () => flattenCategoryTree(categories),
    [categories],
  );

  const categoryHierarchyMaps = useMemo(
    () => buildCategoryHierarchyMaps(flatCategories),
    [flatCategories],
  );

  const categoryPathById = useMemo(() => {
    const byId = new Map(
      flatCategories.map((category) => [category.id, category]),
    );
    const labelMemo = new Map<string, string>();

    const buildPath = (id: string): string => {
      const cached = labelMemo.get(id);
      if (cached) {
        return cached;
      }

      const category = byId.get(id);
      if (!category) {
        labelMemo.set(id, "");
        return "";
      }

      const parentPath =
        category.parentId && byId.has(category.parentId)
          ? buildPath(category.parentId)
          : "";
      const path = parentPath
        ? `${parentPath} / ${category.name}`
        : category.name;

      labelMemo.set(id, path);
      return path;
    };

    const result = new Map<string, string>();
    for (const category of flatCategories) {
      result.set(category.id, buildPath(category.id));
    }

    return result;
  }, [flatCategories]);

  const selectedFabricCategories = useMemo(() => {
    return form.categoryIds
      .map((id) => {
        const category = flatCategories.find((item) => item.id === id);
        if (!category) {
          return null;
        }

        return {
          id,
          label: categoryPathById.get(id) ?? category.name,
        };
      })
      .filter((category): category is { id: string; label: string } => category !== null)
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [categoryPathById, flatCategories, form.categoryIds]);

  const calculatedSellingPriceInInr = useMemo(() => {
    const basePrice = Number(form.basePriceInInr);
    const expenses = Number(form.expensesInInr);
    const gstRate = 5;
    const margin = Number(form.expectedNetMarginPercent) / 100;

    if (
      !Number.isFinite(basePrice) ||
      !Number.isFinite(expenses) ||
      !Number.isFinite(margin) ||
      basePrice < 0 ||
      expenses < 0 ||
      margin < 0 ||
      margin >= 1
    ) {
      return null;
    }

    const calculatedPrice =
      ((basePrice + expenses) / (1 - margin)) * (1 + gstRate / 100);
    return Math.max(0, Math.round(calculatedPrice / 50) * 50 - 1);
  }, [form.basePriceInInr, form.expensesInInr, form.expectedNetMarginPercent]);

  useEffect(() => {
    if (calculatedSellingPriceInInr !== null) {
      setForm((previous) => ({
        ...previous,
        priceInInr: String(calculatedSellingPriceInInr),
      }));
    }
  }, [calculatedSellingPriceInInr]);

  const isSubmitDisabled = useMemo(() => {
    return (
      saving ||
      !form.name.trim() ||
      !form.description.trim() ||
      form.categoryIds.length === 0 ||
      !form.fabricCategoryId ||
      !form.priceInInr ||
      Number(form.priceInInr) <= 0 ||
      !form.originalPriceInInr ||
      Number(form.originalPriceInInr) < Number(form.priceInInr) ||
      Number(form.lengthInMeters) <= 0
    );
  }, [saving, form]);

  const piecesColorOptions = useMemo(() => {
    const p = products.find((x) => x.id === piecesProductId);
    return p?.colors ?? [];
  }, [products, piecesProductId]);

  const colorFormProduct = useMemo(
    () => products.find((product) => product.id === colorForm.productId) ?? null,
    [colorForm.productId, products],
  );

  const inrFormatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
  const formatInr = (paise: number) => inrFormatter.format(paise / 100);

  const filteredInventoryProducts = useMemo(() => {
    const normalizedQuery = inventoryQuery.trim().toLowerCase();

    return products.filter((product) => {
      const matchesFilter =
        inventoryFilter === "ALL" || product.stockStatus === inventoryFilter;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        product.name.toLowerCase().includes(normalizedQuery);

      return matchesFilter && matchesQuery;
    });
  }, [products, inventoryFilter, inventoryQuery]);

  const getPreviewUrl = (file: File) => {
    const cached = previewUrlCacheRef.current.get(file);
    if (cached) {
      return cached;
    }

    const url = URL.createObjectURL(file);
    previewUrlCacheRef.current.set(file, url);
    return url;
  };

  useEffect(() => {
    return () => {
      for (const url of previewUrlCacheRef.current.values()) {
        URL.revokeObjectURL(url);
      }
      previewUrlCacheRef.current.clear();
    };
  }, []);

  const uploadManyImages = async (files: File[]) => {
    const uploaded: { imageUrl: string; imagePublicId: string }[] = [];

    // Process one image at a time to avoid freezing phones when many large photos are selected.
    for (const file of files) {
      let fileToUpload = file;
      try {
        fileToUpload = await optimizeImageForUpload(file);
      } catch {
        fileToUpload = file;
      }

      const uploadBody = new FormData();
      uploadBody.append("image", fileToUpload);

      const uploadRes = await fetch(`${ADMIN_PROXY_BASE}/upload/imagekit`, {
        method: "POST",
        body: uploadBody,
      });

      if (!uploadRes.ok) {
        const uploadError = await uploadRes.json().catch(() => ({}));
        throw new Error(uploadError.message ?? "Image upload failed");
      }

      uploaded.push(
        (await uploadRes.json()) as {
          imageUrl: string;
          imagePublicId: string;
        },
      );
    }

    return uploaded;
  };

  const loadPieces = async () => {
    if (!piecesProductId || !piecesColorId) return;
    try {
      setPiecesLoading(true);
      const res = await fetch(`${ADMIN_PROXY_BASE}/products/${piecesProductId}/colors/${piecesColorId}/pieces`);
      if (!res.ok) throw new Error("Failed to load pieces");
      const data = await res.json() as { sku: string; pieces: AdminPiece[] };
      setPiecesSku(data.sku);
      setPieces(data.pieces);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to load pieces");
    } finally {
      setPiecesLoading(false);
    }
  };

  const loadOrders = async () => {
    try {
      setOrdersLoading(true);
      const res = await fetch(`${ADMIN_PROXY_BASE}/orders`);
      if (!res.ok) throw new Error("Failed to load orders");
      setOrders((await res.json()) as AdminOrder[]);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadGstReport = async () => {
    if (!gstMonth) return;
    try {
      setGstReportLoading(true);
      const res = await fetch(`${ADMIN_PROXY_BASE}/reports/gst?month=${gstMonth}`);
      if (!res.ok) throw new Error("Failed to load GST report");
      setGstReport((await res.json()) as AdminGstReport);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to load GST report");
    } finally {
      setGstReportLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "orders" && orders.length === 0) {
      void loadOrders();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadProducts = async () => {
    const response = await fetch(`${ADMIN_PROXY_BASE}/products`);

    if (!response.ok) {
      throw new Error("Unable to load products");
    }

    const data = (await response.json()) as AdminProduct[];
    setProducts(data);
    if (data[0] && !colorForm.productId) {
      setColorForm((prev) => ({
        ...prev,
        productId: data[0].id,
        priceInInr: String(data[0].priceInPaise / 100),
        originalPriceInInr: data[0].originalPriceInPaise
          ? String(data[0].originalPriceInPaise / 100)
          : "",
      }));
    }
  };

  const loadCategories = async () => {
    const response = await fetch(`${ADMIN_PROXY_BASE}/categories`);

    if (!response.ok) {
      throw new Error("Unable to load categories");
    }

    const data = (await response.json()) as AdminCategoryNode[];
    setCategories(data);
  };

  const loadProductOptions = async () => {
    const response = await fetch(`${ADMIN_PROXY_BASE}/product-options`);

    if (!response.ok) {
      throw new Error("Unable to load product options");
    }

    const data = (await response.json()) as AdminProductOption[];
    setProductOptions(data);
    setForm((previous) => ({
      ...previous,
      work: data.some((option) => option.type === "WORK" && option.name === previous.work)
        ? previous.work
        : data.find((option) => option.type === "WORK")?.name ?? "",
      occasion: data.some((option) => option.type === "OCCASION" && option.name === previous.occasion)
        ? previous.occasion
        : data.find((option) => option.type === "OCCASION")?.name ?? "",
      care: data.some((option) => option.type === "CARE" && option.name === previous.care)
        ? previous.care
        : data.find((option) => option.type === "CARE")?.name ?? "",
    }));
  };

  useEffect(() => {
    const bootstrapAndLoadProducts = async () => {
      const bootstrap = await fetch("/api/admin/bootstrap", {
        method: "POST",
      });

      if (!bootstrap.ok) {
        const payload = await bootstrap.json().catch(() => ({}));
        setLoadingProducts(false);
        setLoadingCategories(false);
        setStatus(payload.message ?? "Admin access denied");
        return;
      }

      try {
        await Promise.all([loadProducts(), loadCategories(), loadProductOptions()]);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to load admin data";
        setStatus(message);
      } finally {
        setLoadingProducts(false);
        setLoadingCategories(false);
      }
    };

    void bootstrapAndLoadProducts();
  }, []);

  const toggleStock = async (product: AdminProduct) => {
    const nextStock: StockState =
      product.stockStatus === "IN_STOCK" ? "SOLD_OUT" : "IN_STOCK";

    try {
      setStockUpdatingId(product.id);

      const response = await fetch(
        `${ADMIN_PROXY_BASE}/products/${product.id}/stock`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ stockStatus: nextStock }),
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message ?? "Failed to update stock");
      }

      setProducts((previous) =>
        previous.map((item) =>
          item.id === product.id ? { ...item, stockStatus: nextStock } : item,
        ),
      );
      setStatus(
        `Updated ${product.name} to ${nextStock === "IN_STOCK" ? "In Stock" : "Sold Out"}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update stock";
      setStatus(message);
    } finally {
      setStockUpdatingId(null);
    }
  };

  const toggleColorStock = async (productId: string, color: AdminColor) => {
    const nextStock = color.stockQuantity > 0 ? 0 : 1;

    try {
      setStockUpdatingId(color.id);
      const response = await fetch(
        `${ADMIN_PROXY_BASE}/products/${productId}/colors/${color.id}/stock`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ stockQuantity: nextStock }),
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message ?? "Failed to update color stock");
      }

      setProducts((previous) =>
        previous.map((product) => {
          if (product.id !== productId) {
            return product;
          }

          const colors = product.colors.map((item) =>
            item.id === color.id ? { ...item, stockQuantity: nextStock } : item,
          );

          const hasInStock = colors.some((item) => item.stockQuantity > 0);
          return {
            ...product,
            colors,
            stockStatus: hasInStock ? "IN_STOCK" : "SOLD_OUT",
          };
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update color stock";
      setStatus(message);
    } finally {
      setStockUpdatingId(null);
    }
  };

  const restockColor = async (productId: string, colorId: string, quantity: number) => {
    if (quantity <= 0) {
      setStatus("Quantity must be greater than 0");
      return;
    }

    try {
      setRestockingColorId(colorId);
      const response = await fetch(
        `${ADMIN_PROXY_BASE}/products/${productId}/colors/${colorId}/restock`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ quantity }),
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message ?? "Failed to restock");
      }

      await loadProducts();
      setRestockQuantity("");
      setRestockingColorId(null);
      setStatus(`Added ${quantity} piece(s) to stock`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to restock";
      setStatus(message);
    } finally {
      setRestockingColorId(null);
    }
  };

  const hideProduct = async (productId: string) => {
    try {
      setStockUpdatingId(productId);
      const response = await fetch(
        `${ADMIN_PROXY_BASE}/products/${productId}/hide`,
        { method: "PATCH" },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message ?? "Failed to hide product");
      }

      await loadProducts();
      setStatus("Product hidden");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to hide product";
      setStatus(message);
    } finally {
      setStockUpdatingId(null);
      setHideDeleteConfirmProductId(null);
    }
  };

  const deleteProduct = async (productId: string) => {
    try {
      setStockUpdatingId(productId);
      const response = await fetch(
        `${ADMIN_PROXY_BASE}/products/${productId}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message ?? "Failed to delete product");
      }

      await loadProducts();
      setStatus("Product deleted");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete product";
      setStatus(message);
    } finally {
      setStockUpdatingId(null);
      setHideDeleteConfirmProductId(null);
    }
  };

  const setDefaultColor = async (productId: string, colorId: string) => {
    try {
      setDefaultUpdatingId(colorId);
      const response = await fetch(
        `${ADMIN_PROXY_BASE}/products/${productId}/colors/${colorId}/default`,
        {
          method: "PATCH",
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message ?? "Failed to set default color");
      }

      setProducts((previous) =>
        previous.map((product) => {
          if (product.id !== productId) {
            return product;
          }

          return {
            ...product,
            colors: product.colors.map((color) => ({
              ...color,
              isDefault: color.id === colorId,
            })),
          };
        }),
      );
      setStatus("Default color updated");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to set default color";
      setStatus(message);
    } finally {
      setDefaultUpdatingId(null);
    }
  };

  const addColorVariant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!colorForm.productId || !colorForm.name.trim()) {
      setStatus("Choose a product and enter color name");
      return;
    }

    try {
      setColorSubmitting(true);
      setStatus(
        colorImageFiles.length > 0
          ? "Optimizing and uploading color images..."
          : "Adding color...",
      );
      const colorUploads =
        colorImageFiles.length > 0
          ? await uploadManyImages(colorImageFiles)
          : [];

      const response = await fetch(
        `${ADMIN_PROXY_BASE}/products/${colorForm.productId}/colors`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: colorForm.name.trim(),
            colorCode: colorForm.colorCode.trim() || undefined,
            borderColorName: colorForm.borderColorName.trim() || undefined,
            borderColorCode: colorForm.borderColorCode.trim() || undefined,
            stockQuantity: Math.max(0, Number(colorForm.stockQuantity || 0)),
            isDefault: colorForm.isDefault,
            priceInPaise:
              colorFormProduct &&
              Number(colorForm.priceInInr) !== colorFormProduct.priceInPaise / 100
                ? Math.round(Number(colorForm.priceInInr) * 100)
                : null,
            originalPriceInPaise:
              colorFormProduct &&
              Number(colorForm.originalPriceInInr) !==
                (colorFormProduct.originalPriceInPaise ?? 0) / 100
                ? Math.round(Number(colorForm.originalPriceInInr) * 100)
                : null,
            imageUploads: colorUploads,
          }),
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message ?? "Failed to add color");
      }

      const created = (await response.json()) as {
        id: string;
        name: string;
        stockQuantity: number;
        isDefault: boolean;
        priceInPaise: number | null;
        originalPriceInPaise: number | null;
      };

      setProducts((previous) =>
        previous.map((product) => {
          if (product.id !== colorForm.productId) {
            return product;
          }

          const nextColors = colorForm.isDefault
            ? product.colors
                .map((color) => ({ ...color, isDefault: false }))
                .concat(created)
            : product.colors.concat(created);

          const hasInStock = nextColors.some(
            (color) => color.stockQuantity > 0,
          );
          return {
            ...product,
            colors: nextColors,
            stockStatus: hasInStock ? "IN_STOCK" : "SOLD_OUT",
          };
        }),
      );

      setColorForm((prev) => ({
        ...prev,
        name: "",
        colorCode: "",
        borderColorName: "",
        borderColorCode: "",
        stockQuantity: "0",
        priceInInr: colorFormProduct
          ? String(colorFormProduct.priceInPaise / 100)
          : "",
        originalPriceInInr: colorFormProduct?.originalPriceInPaise
          ? String(colorFormProduct.originalPriceInPaise / 100)
          : "",
        isDefault: false,
      }));
      setColorImageFiles([]);
      setStatus("Color added");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to add color";
      setStatus(message);
    } finally {
      setColorSubmitting(false);
    }
  };

  const updateField = <K extends keyof ProductForm>(
    key: K,
    value: ProductForm[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const createCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = categoryForm.name.trim();
    if (!trimmedName) {
      setStatus("Category name is required");
      return;
    }

    try {
      setCategorySaving(true);
      const response = await fetch(`${ADMIN_PROXY_BASE}/categories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          parentId: categoryForm.parentId || null,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message ?? "Failed to create category");
      }

      await loadCategories();
      setCategoryForm({ name: "", parentId: "" });
      setStatus("Category created");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create category";
      setStatus(message);
    } finally {
      setCategorySaving(false);
    }
  };

  const deleteCategory = async (category: FlatCategoryOption) => {
    if (!window.confirm(`Delete ${category.name}? This cannot be undone.`)) return;

    try {
      setCategoryDeletingId(category.id);
      const response = await fetch(`${ADMIN_PROXY_BASE}/categories/${category.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message ?? "Failed to delete category");
      }

      await loadCategories();
      setStatus("Category deleted");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to delete category");
    } finally {
      setCategoryDeletingId(null);
    }
  };

  const createProductOption = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = productOptionForm.name.trim();
    if (!name) {
      setStatus("Option name is required");
      return;
    }

    try {
      setProductOptionSaving(true);
      const response = await fetch(`${ADMIN_PROXY_BASE}/product-options`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: productOptionForm.type, name }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message ?? "Failed to create product option");
      }

      await loadProductOptions();
      setProductOptionForm((previous) => ({ ...previous, name: "" }));
      setStatus("Product option created");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to create product option");
    } finally {
      setProductOptionSaving(false);
    }
  };

  const deleteProductOption = async (option: AdminProductOption) => {
    if (!window.confirm(`Delete ${option.name}? This cannot be undone.`)) return;

    try {
      setProductOptionDeletingId(option.id);
      const response = await fetch(`${ADMIN_PROXY_BASE}/product-options/${option.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message ?? "Failed to delete product option");
      }

      await loadProductOptions();
      setStatus("Product option deleted");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to delete product option");
    } finally {
      setProductOptionDeletingId(null);
    }
  };

  const persistProductCategories = async (
    productId: string,
    categoryIds: string[],
  ) => {
    try {
      setProductCategorySavingId(productId);
      const response = await fetch(
        `${ADMIN_PROXY_BASE}/products/${productId}/categories`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ categoryIds }),
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message ?? "Failed to update product categories");
      }

      const updated = (await response.json()) as AdminProduct;
      setProducts((previous) =>
        previous.map((product) =>
          product.id === productId ? updated : product,
        ),
      );
      setStatus("Product categories updated");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update product categories";
      setStatus(message);
    } finally {
      setProductCategorySavingId(null);
    }
  };

  const toggleDraftCategory = (categoryId: string, checked: boolean) => {
    const ancestorIds = categoryHierarchyMaps.ancestorIdsById.get(categoryId) ?? [];
    const descendantIds = categoryHierarchyMaps.descendantIdsById.get(categoryId) ?? [];

    const nextCategoryIds = (() => {
        const next = new Set(form.categoryIds);

        if (checked) {
          next.add(categoryId);
          for (const ancestorId of ancestorIds) {
            next.add(ancestorId);
          }
        } else {
          next.delete(categoryId);
          for (const descendantId of descendantIds) {
            next.delete(descendantId);
          }
        }

        // Ensure closure: any selected category implies all ancestors are selected.
        for (const selectedId of [...next]) {
          for (const ancestorId of categoryHierarchyMaps.ancestorIdsById.get(selectedId) ?? []) {
            next.add(ancestorId);
          }
        }

        return [...next];
      })();

    setForm((previous) => ({
      ...previous,
      categoryIds: nextCategoryIds,
      fabricCategoryId: nextCategoryIds.includes(previous.fabricCategoryId)
        ? previous.fabricCategoryId
        : "",
    }));
  };

  const toggleInventoryProductCategory = (
    product: AdminProduct,
    categoryId: string,
    checked: boolean,
  ) => {
    const ancestorIds = categoryHierarchyMaps.ancestorIdsById.get(categoryId) ?? [];
    const descendantIds = categoryHierarchyMaps.descendantIdsById.get(categoryId) ?? [];

    const next = new Set(product.categories.map((item) => item.id));

    if (checked) {
      next.add(categoryId);
      for (const ancestorId of ancestorIds) {
        next.add(ancestorId);
      }
    } else {
      next.delete(categoryId);
      for (const descendantId of descendantIds) {
        next.delete(descendantId);
      }
    }

    for (const selectedId of [...next]) {
      for (const ancestorId of categoryHierarchyMaps.ancestorIdsById.get(selectedId) ?? []) {
        next.add(ancestorId);
      }
    }

    const nextCategoryIds = [...next];

    void persistProductCategories(product.id, nextCategoryIds);
  };

  const createProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setSaving(true);
      const uploadedImages =
        productImageFiles.length > 0
          ? await uploadManyImages(productImageFiles)
          : [];

      setStatus(
        uploadedImages.length > 0
          ? "Creating product..."
          : "Creating product without images...",
      );

      const productRes = await fetch(`${ADMIN_PROXY_BASE}/products`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim(),
          fabricCategoryId: form.fabricCategoryId,
          lengthInMeters: Number(form.lengthInMeters),
          blouseIncluded: form.blouseIncluded,
          work: form.work,
          occasion: form.occasion,
          care: form.care,
          priceInPaise: Math.round(Number(form.priceInInr) * 100),
          originalPriceInPaise: Math.round(Number(form.originalPriceInInr) * 100),
          imageUrl: uploadedImages[0]?.imageUrl,
          imagePublicId: uploadedImages[0]?.imagePublicId,
          imageUploads: uploadedImages,
          categoryIds: form.categoryIds,
        }),
      });

      if (!productRes.ok) {
        const productError = await productRes.json().catch(() => ({}));
        throw new Error(productError.message ?? "Product creation failed");
      }

      const createdProduct = (await productRes.json()) as AdminProduct;
      setProducts((previous) => [createdProduct, ...previous]);

      setStatus("Product created successfully");
      setProductImageFiles([]);
      setForm((prev) => ({
        ...prev,
        name: "",
        description: "",
        fabricCategoryId: "",
        work: "Handcrafted",
        occasion: "Festive & occasion wear",
        care: "Dry clean only",
        priceInInr: "",
        originalPriceInInr: "",
        basePriceInInr: "",
        expensesInInr: "200",
        expectedNetMarginPercent: "35",
        categoryIds: [],
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected error";
      setStatus(message);
    } finally {
      setSaving(false);
    }
  };

  const appendProductImages = async (productId: string) => {
    const files = appendProductFiles[productId] ?? [];
    if (files.length === 0) {
      setStatus("Select product images to append");
      return;
    }

    try {
      setAppendProductLoadingId(productId);
      setStatus("Optimizing, uploading, and appending product images...");
      const uploads = await uploadManyImages(files);

      const response = await fetch(
        `${ADMIN_PROXY_BASE}/products/${productId}/images`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ imageUploads: uploads }),
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message ?? "Failed to append product images");
      }

      await loadProducts();
      setAppendProductFiles((prev) => ({ ...prev, [productId]: [] }));
      setStatus("Product images appended");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to append product images";
      setStatus(message);
    } finally {
      setAppendProductLoadingId(null);
    }
  };

  const appendColorImages = async (productId: string, colorId: string) => {
    const files = appendColorFiles[colorId] ?? [];
    if (files.length === 0) {
      setStatus("Select color images to append");
      return;
    }

    try {
      setAppendColorLoadingId(colorId);
      setStatus("Optimizing, uploading, and appending color images...");
      const uploads = await uploadManyImages(files);

      const response = await fetch(
        `${ADMIN_PROXY_BASE}/products/${productId}/colors/${colorId}/images`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ imageUploads: uploads }),
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message ?? "Failed to append color images");
      }

      await loadProducts();
      setAppendColorFiles((prev) => ({ ...prev, [colorId]: [] }));
      setStatus("Color images appended");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to append color images";
      setStatus(message);
    } finally {
      setAppendColorLoadingId(null);
    }
  };

  const reorderSelectedProductImageByDrop = (
    sourceIndex: number,
    targetIndex: number,
  ) => {
    setProductImageFiles((prev) =>
      moveArrayItem(prev, sourceIndex, targetIndex),
    );
  };

  const reorderSelectedColorImageByDrop = (
    sourceIndex: number,
    targetIndex: number,
  ) => {
    setColorImageFiles((prev) => moveArrayItem(prev, sourceIndex, targetIndex));
  };

  const reorderAppendProductImageByDrop = (
    productId: string,
    sourceIndex: number,
    targetIndex: number,
  ) => {
    setAppendProductFiles((prev) => {
      const files = prev[productId] ?? [];
      return {
        ...prev,
        [productId]: moveArrayItem(files, sourceIndex, targetIndex),
      };
    });
  };

  const reorderAppendColorImageByDrop = (
    colorId: string,
    sourceIndex: number,
    targetIndex: number,
  ) => {
    setAppendColorFiles((prev) => {
      const files = prev[colorId] ?? [];
      return {
        ...prev,
        [colorId]: moveArrayItem(files, sourceIndex, targetIndex),
      };
    });
  };

  const moveSelectedProductImageByStep = (index: number, step: -1 | 1) => {
    reorderSelectedProductImageByDrop(index, index + step);
  };

  const moveSelectedColorImageByStep = (index: number, step: -1 | 1) => {
    reorderSelectedColorImageByDrop(index, index + step);
  };

  const moveAppendProductImageByStep = (
    productId: string,
    index: number,
    step: -1 | 1,
  ) => {
    reorderAppendProductImageByDrop(productId, index, index + step);
  };

  const moveAppendColorImageByStep = (
    colorId: string,
    index: number,
    step: -1 | 1,
  ) => {
    reorderAppendColorImageByDrop(colorId, index, index + step);
  };

  const moveProductGalleryImageByStep = async (
    productId: string,
    imageId: string,
    step: -1 | 1,
  ) => {
    const product = products.find((item) => item.id === productId);
    const images = (product?.images ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const currentIndex = images.findIndex((image) => image.id === imageId);
    const targetIndex = currentIndex + step;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= images.length) {
      return;
    }

    const targetImageId = images[targetIndex]?.id;
    if (!targetImageId) {
      return;
    }

    await reorderProductImagesByDrop(productId, imageId, targetImageId);
  };

  const moveColorGalleryImageByStep = async (
    productId: string,
    colorId: string,
    imageId: string,
    step: -1 | 1,
  ) => {
    const product = products.find((item) => item.id === productId);
    const color = product?.colors.find((item) => item.id === colorId);
    const images = (color?.images ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const currentIndex = images.findIndex((image) => image.id === imageId);
    const targetIndex = currentIndex + step;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= images.length) {
      return;
    }

    const targetImageId = images[targetIndex]?.id;
    if (!targetImageId) {
      return;
    }

    await reorderColorImagesByDrop(productId, colorId, imageId, targetImageId);
  };

  const reorderProductImagesByDrop = async (
    productId: string,
    draggedImageId: string,
    targetImageId: string,
  ) => {
    if (!draggedImageId || draggedImageId === targetImageId) {
      return;
    }

    const product = products.find((item) => item.id === productId);
    const images = (product?.images ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const sourceIndex = images.findIndex(
      (image) => image.id === draggedImageId,
    );
    const targetIndex = images.findIndex((image) => image.id === targetImageId);
    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }

    const reordered = images.slice();
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    try {
      setReorderProductLoadingId(productId);
      const response = await fetch(
        `${ADMIN_PROXY_BASE}/products/${productId}/images/reorder`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            imageIds: reordered.map((image) => image.id),
          }),
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message ?? "Failed to reorder product images");
      }

      await loadProducts();
      setStatus("Product image order updated");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to reorder product images";
      setStatus(message);
    } finally {
      setReorderProductLoadingId(null);
    }
  };

  const reorderColorImagesByDrop = async (
    productId: string,
    colorId: string,
    draggedImageId: string,
    targetImageId: string,
  ) => {
    if (!draggedImageId || draggedImageId === targetImageId) {
      return;
    }

    const product = products.find((item) => item.id === productId);
    const color = product?.colors.find((item) => item.id === colorId);
    const images = (color?.images ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const sourceIndex = images.findIndex(
      (image) => image.id === draggedImageId,
    );
    const targetIndex = images.findIndex((image) => image.id === targetImageId);
    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }

    const reordered = images.slice();
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    try {
      setReorderColorLoadingId(colorId);
      const response = await fetch(
        `${ADMIN_PROXY_BASE}/products/${productId}/colors/${colorId}/images/reorder`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            imageIds: reordered.map((image) => image.id),
          }),
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message ?? "Failed to reorder color images");
      }

      await loadProducts();
      setStatus("Color image order updated");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to reorder color images";
      setStatus(message);
    } finally {
      setReorderColorLoadingId(null);
    }
  };

  return (
    <main className="mx-auto max-w-[1600px] space-y-6 px-4 pb-24 pt-8 sm:px-6 lg:px-8">
      <header className="space-y-1">
        <h1 className="font-serif text-4xl text-ink">Admin Dashboard</h1>
        <p className="text-sm text-[#6b625b]">
          Manage catalog, colors, images, and stock across mobile and desktop.
        </p>
      </header>

      <nav className="rounded-2xl border border-[#e8ddcf] bg-white/80 p-2 shadow-sm backdrop-blur">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          <button
            type="button"
            onClick={() => selectAdminTab("overview")}
            className={`rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${
              activeTab === "overview"
                ? "bg-wine text-white"
                : "bg-[#f7f1e8] text-[#5b5149]"
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => selectAdminTab("add-product")}
            className={`rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${
              activeTab === "add-product"
                ? "bg-wine text-white"
                : "bg-[#f7f1e8] text-[#5b5149]"
            }`}
          >
            Add Product
          </button>
          <button
            type="button"
            onClick={() => selectAdminTab("add-color")}
            className={`rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${
              activeTab === "add-color"
                ? "bg-wine text-white"
                : "bg-[#f7f1e8] text-[#5b5149]"
            }`}
          >
            Add Color
          </button>
          <button
            type="button"
            onClick={() => selectAdminTab("inventory")}
            className={`rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${
              activeTab === "inventory"
                ? "bg-wine text-white"
                : "bg-[#f7f1e8] text-[#5b5149]"
            }`}
          >
            Inventory
          </button>
          <button
            type="button"
            onClick={() => selectAdminTab("pieces")}
            className={`rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${
              activeTab === "pieces"
                ? "bg-wine text-white"
                : "bg-[#f7f1e8] text-[#5b5149]"
            }`}
          >
            Pieces
          </button>
          <button
            type="button"
            onClick={() => selectAdminTab("orders")}
            className={`rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${
              activeTab === "orders"
                ? "bg-wine text-white"
                : "bg-[#f7f1e8] text-[#5b5149]"
            }`}
          >
            Orders
          </button>
          <button
            type="button"
            onClick={() => selectAdminTab("general-info")}
            className={`rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${
              activeTab === "general-info"
                ? "bg-wine text-white"
                : "bg-[#f7f1e8] text-[#5b5149]"
            }`}
          >
            General Info
          </button>
        </div>
      </nav>

      {status ? (
        <p className="rounded-xl border border-[#e8ddcf] bg-white px-3 py-2 text-xs text-[#6b625b]">
          {status}
        </p>
      ) : null}

      {activeTab === "overview" ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="rounded-2xl border border-[#e8ddcf] bg-white p-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#6b625b]">
              Total Products
            </p>
            <p className="mt-2 text-3xl font-semibold text-ink">{products.length}</p>
          </article>
          <article className="rounded-2xl border border-[#e8ddcf] bg-white p-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#6b625b]">
              In Stock
            </p>
            <p className="mt-2 text-3xl font-semibold text-ink">
              {products.filter((item) => item.stockStatus === "IN_STOCK").length}
            </p>
          </article>
          <article className="rounded-2xl border border-[#e8ddcf] bg-white p-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#6b625b]">
              Sold Out
            </p>
            <p className="mt-2 text-3xl font-semibold text-ink">
              {products.filter((item) => item.stockStatus === "SOLD_OUT").length}
            </p>
          </article>
          <article className="rounded-2xl border border-[#e8ddcf] bg-white p-4 shadow-sm">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#6b625b]">
              Next Step
            </p>
            <button
              type="button"
              onClick={() => selectAdminTab("inventory")}
              className="mt-3 rounded-full bg-wine px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white"
            >
              Open Inventory
            </button>
          </article>
        </section>
      ) : null}

      {activeTab !== "overview" ? (
      <div className="w-full space-y-6">
        <div className="space-y-6">
          {activeTab === "add-product" ? (
          <section className="rounded-2xl border border-[#e8ddcf] bg-white/70 p-4 shadow-sm backdrop-blur lg:p-5">
            <h2 className="font-semibold">Add Item</h2>
            <form onSubmit={createProduct} className="mt-3 space-y-3 text-sm">
              <label className="grid gap-1 text-xs text-[#5b5149]">
                <span>Product name</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  className="w-full rounded-xl border border-[#d7c9b7] p-2 text-sm"
                />
              </label>
              <div className="space-y-2 rounded-xl border border-[#e8ddcf] bg-[#fcf8f2] p-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5b5149]">
                  Categories
                </p>
                <p className="text-[11px] text-[#6b625b]">
                  Select at least one category. Selecting a sub-category auto-selects all parents. Unselecting a parent removes its sub-categories.
                </p>
                {loadingCategories ? (
                  <p className="text-xs text-[#6b625b]">Loading categories...</p>
                ) : null}
                {!loadingCategories && flatCategories.length === 0 ? (
                  <p className="text-xs text-[#6b625b]">
                    No categories yet. Create one in General Info.
                  </p>
                ) : null}
                {!loadingCategories && flatCategories.length > 0 ? (
                  <div className="max-h-52 overflow-y-auto pr-1">
                    <CategoryTreeSelector
                      nodes={categories}
                      selectedCategoryIds={form.categoryIds}
                      onToggle={toggleDraftCategory}
                    />
                  </div>
                ) : null}
                {selectedFabricCategories.length > 0 ? (
                  <div className="space-y-2 border-t border-[#eadfce] pt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5c4a42]">
                      Selected Category Hierarchy
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedFabricCategories.map((category) => (
                        <span
                          key={category.id}
                          className="rounded-full border border-[#e4d9d0] bg-white px-2.5 py-1 text-[11px] text-[#5c4a42]"
                        >
                          {category.label}
                        </span>
                      ))}
                    </div>
                    <label className="grid gap-1 text-xs text-[#5c4a42]">
                      Fabric category
                      <select
                        value={form.fabricCategoryId}
                        onChange={(event) => updateField("fabricCategoryId", event.target.value)}
                        required
                        className="w-full rounded-xl border border-[#d7c9b7] bg-white p-2"
                      >
                        <option value="">Select from the hierarchy</option>
                        {selectedFabricCategories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}
              </div>
              <label className="grid gap-1 text-xs text-[#5b5149]">
                <span>Product images</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) =>
                    setProductImageFiles(Array.from(event.target.files ?? []))
                  }
                  className="w-full rounded-xl border border-[#d7c9b7] p-2 text-sm"
                />
              </label>
              <p className="text-xs text-[#6b625b]">
                Product images selected: {productImageFiles.length}
              </p>
              <p className="text-[11px] text-[#6b625b]">
                Photos are optimized on your device before upload.
              </p>
              {productImageFiles.length > 0 ? (
                <div className="grid grid-cols-4 gap-2">
                  {productImageFiles.map((file, idx) => {
                    const previewUrl = getPreviewUrl(file);
                    return (
                      <div
                        key={`${file.name}-${idx}`}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData(
                            "text/selected-product-index",
                            String(idx),
                          );
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const sourceIndex = Number(
                            event.dataTransfer.getData(
                              "text/selected-product-index",
                            ),
                          );
                          if (Number.isFinite(sourceIndex)) {
                            reorderSelectedProductImageByDrop(sourceIndex, idx);
                          }
                        }}
                        className="space-y-1 cursor-move"
                      >
                        <div className="relative">
                          <img
                            src={previewUrl}
                            alt={`Product upload ${idx + 1}`}
                            className="h-16 w-full rounded-lg border border-[#e2d6c8] object-cover"
                          />
                          <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            {idx + 1}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#6b625b]">
                          Drag to reorder
                        </p>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              moveSelectedProductImageByStep(idx, -1)
                            }
                            disabled={idx === 0}
                            className="w-full rounded border border-[#d7c9b7] px-1 py-0.5 text-[10px] disabled:opacity-40"
                          >
                            Prev
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              moveSelectedProductImageByStep(idx, 1)
                            }
                            disabled={idx === productImageFiles.length - 1}
                            className="w-full rounded border border-[#d7c9b7] px-1 py-0.5 text-[10px] disabled:opacity-40"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <label className="grid gap-1 text-xs text-[#5b5149]">
                <span>Description</span>
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    updateField("description", event.target.value)
                  }
                  className="h-24 w-full rounded-xl border border-[#d7c9b7] p-2 text-sm"
                />
              </label>
              <div>
                <label className="grid gap-1 text-xs text-[#5b5149]">
                  <span>Length in meters</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={form.lengthInMeters}
                    onChange={(event) =>
                      updateField("lengthInMeters", event.target.value)
                    }
                    className="w-full rounded-xl border border-[#d7c9b7] p-2 text-sm"
                  />
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="grid gap-1 text-xs text-[#5b5149]">
                  <span>Work</span>
                  <select
                    value={form.work}
                    onChange={(event) => updateField("work", event.target.value)}
                    className="w-full rounded-xl border border-[#d7c9b7] bg-white p-2 text-sm"
                  >
                    {productOptions.filter((option) => option.type === "WORK").map((option) => <option key={option.id} value={option.name}>{option.name}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-[#5b5149]">
                  <span>Occasion</span>
                  <select
                    value={form.occasion}
                    onChange={(event) => updateField("occasion", event.target.value)}
                    className="w-full rounded-xl border border-[#d7c9b7] bg-white p-2 text-sm"
                  >
                    {productOptions.filter((option) => option.type === "OCCASION").map((option) => <option key={option.id} value={option.name}>{option.name}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-[#5b5149]">
                  <span>Care</span>
                  <select
                    value={form.care}
                    onChange={(event) => updateField("care", event.target.value)}
                    className="w-full rounded-xl border border-[#d7c9b7] bg-white p-2 text-sm"
                  >
                    {productOptions.filter((option) => option.type === "CARE").map((option) => <option key={option.id} value={option.name}>{option.name}</option>)}
                  </select>
                </label>
              </div>
              <section className="space-y-3 rounded-lg border border-dashed border-[#cdbda8] bg-[#f6f1ea] p-3.5">
                <div className="flex items-baseline justify-between gap-3 border-b border-[#ded2c4] pb-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#806350]">Pricing helper</p>
                    <h3 className="mt-0.5 text-sm font-semibold text-[#5c4a42]">Price Decider</h3>
                  </div>
                  <span className="text-right text-[11px] text-[#806350]">Net margin before GST</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1 text-xs text-[#5b5149]">
                    <span>Base price</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={form.basePriceInInr}
                      onChange={(event) => updateField("basePriceInInr", event.target.value)}
                      placeholder="INR"
                      className="w-full rounded-lg border border-[#d7c9b7] bg-white/75 p-2"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-[#5b5149]">
                    <span>GST</span>
                    <output className="block w-full rounded-lg border border-[#d7c9b7] bg-white/75 p-2">5%</output>
                  </label>
                  <label className="space-y-1 text-xs text-[#5b5149]">
                    <span>Expenses</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={form.expensesInInr}
                      onChange={(event) => updateField("expensesInInr", event.target.value)}
                      placeholder="INR"
                      className="w-full rounded-lg border border-[#d7c9b7] bg-white/75 p-2"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-[#5b5149]">
                    <span>Expected net margin</span>
                    <input
                      type="number"
                      min="0"
                      max="99"
                      step="1"
                      value={form.expectedNetMarginPercent}
                      onChange={(event) => updateField("expectedNetMarginPercent", event.target.value)}
                      placeholder="Percent"
                      className="w-full rounded-lg border border-[#d7c9b7] bg-white/75 p-2"
                    />
                  </label>
                </div>
                <div className="border-l-2 border-[#9b4c3e] bg-white/55 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#806350]">Calculated selling price</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#5c4a42]">
                    {calculatedSellingPriceInInr === null ? "Enter valid price inputs" : `₹${calculatedSellingPriceInInr.toLocaleString("en-IN")}`}
                  </p>
                </div>
              </section>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-xs text-[#5b5149]">
                  <span>Selling price</span>
                  <input
                    type="number"
                    min="1"
                    value={form.priceInInr}
                    onChange={(event) =>
                      updateField("priceInInr", event.target.value)
                    }
                    className="w-full rounded-xl border border-[#d7c9b7] p-2 text-sm"
                  />
                </label>
                <label className="grid gap-1 text-xs text-[#5b5149]">
                  <span>Non-discounted price</span>
                  <input
                    type="number"
                    min="1"
                    value={form.originalPriceInInr}
                    onChange={(event) => updateField("originalPriceInInr", event.target.value)}
                    className="w-full rounded-xl border border-[#d7c9b7] p-2 text-sm"
                    required
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[#5b5149]">
                <input
                  type="checkbox"
                  checked={form.blouseIncluded}
                  onChange={(event) =>
                    updateField("blouseIncluded", event.target.checked)
                  }
                />
                Blouse Included
              </label>
              <button
                type="submit"
                disabled={isSubmitDisabled}
                className="w-full rounded-full bg-wine py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Item"}
              </button>
            </form>
          </section>
          ) : null}

          {activeTab === "add-color" ? (
          <section className="rounded-2xl border border-[#e8ddcf] bg-white/70 p-4 shadow-sm backdrop-blur lg:p-5">
            <h2 className="font-semibold">Add Color Variant</h2>
            <form onSubmit={addColorVariant} className="mt-3 space-y-3 text-sm">
              <select
                value={colorForm.productId}
                onChange={(event) => {
                  const productId = event.target.value;
                  const product = products.find((item) => item.id === productId);
                  setColorForm((prev) => ({
                    ...prev,
                    productId,
                    priceInInr: product ? String(product.priceInPaise / 100) : "",
                    originalPriceInInr: product?.originalPriceInPaise
                      ? String(product.originalPriceInPaise / 100)
                      : "",
                  }));
                }}
                className="w-full rounded-xl border border-[#d7c9b7] bg-white p-2"
              >
                <option value="">Select product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
              {colorFormProduct ? (
                <div className="grid gap-1 rounded-xl border border-[#e8ddcf] bg-[#fcf8f2] p-3 text-xs text-[#5b5149] sm:grid-cols-3">
                  <p><span className="font-semibold text-[#4e4038]">Work:</span> {colorFormProduct.work}</p>
                  <p><span className="font-semibold text-[#4e4038]">Occasion:</span> {colorFormProduct.occasion}</p>
                  <p><span className="font-semibold text-[#4e4038]">Care:</span> {colorFormProduct.care}</p>
                </div>
              ) : null}
              <div className="space-y-3">
                <ColorPickerInput
                  label="Body colour"
                  colorName={colorForm.name}
                  colorCode={colorForm.colorCode}
                  onColorNameChange={(v) => setColorForm((p) => ({ ...p, name: v }))}
                  onColorCodeChange={(v) => setColorForm((p) => ({ ...p, colorCode: v }))}
                  placeholder="e.g. Crimson"
                />
                <ColorPickerInput
                  label="Border colour"
                  colorName={colorForm.borderColorName}
                  colorCode={colorForm.borderColorCode}
                  onColorNameChange={(v) => setColorForm((p) => ({ ...p, borderColorName: v }))}
                  onColorCodeChange={(v) => setColorForm((p) => ({ ...p, borderColorCode: v }))}
                  placeholder="e.g. Gold (optional)"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="0"
                  value={colorForm.stockQuantity}
                  onChange={(event) =>
                    setColorForm((prev) => ({
                      ...prev,
                      stockQuantity: event.target.value,
                    }))
                  }
                  placeholder="Stock quantity"
                  className="w-full rounded-xl border border-[#d7c9b7] p-2"
                />
                <label className="flex items-center gap-2 rounded-xl border border-[#d7c9b7] p-2 text-xs uppercase tracking-[0.14em] text-[#5b5149]">
                  <input
                    type="checkbox"
                    checked={colorForm.isDefault}
                    onChange={(event) =>
                      setColorForm((prev) => ({
                        ...prev,
                        isDefault: event.target.checked,
                      }))
                    }
                  />
                  Set as default
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-xs text-[#5b5149]">
                  <span>Selling price</span>
                  <input
                    type="number"
                    min="1"
                    value={colorForm.priceInInr}
                    onChange={(event) =>
                      setColorForm((prev) => ({
                        ...prev,
                        priceInInr: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-[#d7c9b7] p-2 text-sm"
                  />
                </label>
                <label className="grid gap-1 text-xs text-[#5b5149]">
                  <span>Non-discounted price</span>
                  <input
                    type="number"
                    min="1"
                    value={colorForm.originalPriceInInr}
                    onChange={(event) =>
                      setColorForm((prev) => ({
                        ...prev,
                        originalPriceInInr: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-[#d7c9b7] p-2 text-sm"
                    required
                  />
                </label>
              </div>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) =>
                  setColorImageFiles(Array.from(event.target.files ?? []))
                }
                className="w-full rounded-xl border border-[#d7c9b7] p-2"
              />
              <p className="text-xs text-[#6b625b]">
                Color images selected: {colorImageFiles.length}
              </p>
              <p className="text-[11px] text-[#6b625b]">
                Photos are optimized on your device before upload.
              </p>
              {colorImageFiles.length > 0 ? (
                <div className="grid grid-cols-4 gap-2">
                  {colorImageFiles.map((file, idx) => {
                    const previewUrl = getPreviewUrl(file);
                    return (
                      <div
                        key={`${file.name}-${idx}`}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData(
                            "text/selected-color-index",
                            String(idx),
                          );
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const sourceIndex = Number(
                            event.dataTransfer.getData(
                              "text/selected-color-index",
                            ),
                          );
                          if (Number.isFinite(sourceIndex)) {
                            reorderSelectedColorImageByDrop(sourceIndex, idx);
                          }
                        }}
                        className="space-y-1 cursor-move"
                      >
                        <div className="relative">
                          <img
                            src={previewUrl}
                            alt={`Color upload ${idx + 1}`}
                            className="h-16 w-full rounded-lg border border-[#e2d6c8] object-cover"
                          />
                          <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            {idx + 1}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#6b625b]">
                          Drag to reorder
                        </p>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              moveSelectedColorImageByStep(idx, -1)
                            }
                            disabled={idx === 0}
                            className="w-full rounded border border-[#d7c9b7] px-1 py-0.5 text-[10px] disabled:opacity-40"
                          >
                            Prev
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSelectedColorImageByStep(idx, 1)}
                            disabled={idx === colorImageFiles.length - 1}
                            className="w-full rounded border border-[#d7c9b7] px-1 py-0.5 text-[10px] disabled:opacity-40"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <button
                type="submit"
                disabled={colorSubmitting}
                className="w-full rounded-full bg-wine py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {colorSubmitting ? "Adding..." : "Add Color"}
              </button>
            </form>
          </section>
          ) : null}

          {activeTab === "pieces" ? (
          <section className="rounded-2xl border border-[#e8ddcf] bg-white/70 p-4 shadow-sm backdrop-blur lg:p-5">
            <h2 className="font-semibold">View Pieces &amp; Print Stickers</h2>
            <div className="mt-3 space-y-3 text-sm">
              <select
                value={piecesProductId}
                onChange={(e) => { setPiecesProductId(e.target.value); setPiecesColorId(""); setPieces([]); }}
                className="w-full rounded-xl border border-[#d7c9b7] bg-white p-2"
              >
                <option value="">Select product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select
                value={piecesColorId}
                onChange={(e) => { setPiecesColorId(e.target.value); setPieces([]); }}
                disabled={!piecesProductId}
                className="w-full rounded-xl border border-[#d7c9b7] bg-white p-2 disabled:opacity-50"
              >
                <option value="">Select colour variant</option>
                {piecesColorOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.sku ? ` — ${c.sku}` : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void loadPieces()}
                disabled={!piecesProductId || !piecesColorId || piecesLoading}
                className="w-full rounded-full bg-wine py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-white disabled:opacity-50"
              >
                {piecesLoading ? "Loading..." : "Load Pieces"}
              </button>
            </div>
          </section>
          ) : null}

          {activeTab === "orders" ? (
          <section className="rounded-2xl border border-[#e8ddcf] bg-white/70 p-4 shadow-sm backdrop-blur lg:p-5">
            <h2 className="font-semibold">GST Report (GSTR-1 B2CS)</h2>
            <div className="mt-3 space-y-3 text-sm">
              <div className="flex gap-2">
                <input
                  type="month"
                  value={gstMonth}
                  onChange={(e) => setGstMonth(e.target.value)}
                  className="flex-1 rounded-xl border border-[#d7c9b7] p-2"
                />
                <button
                  type="button"
                  onClick={() => void loadGstReport()}
                  disabled={!gstMonth || gstReportLoading}
                  className="rounded-xl border border-[#d7c9b7] px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] disabled:opacity-50"
                >
                  {gstReportLoading ? "..." : "Run"}
                </button>
              </div>
              <button
                type="button"
                onClick={() => void loadOrders()}
                disabled={ordersLoading}
                className="w-full rounded-full bg-wine py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-white disabled:opacity-50"
              >
                {ordersLoading ? "Loading..." : "Refresh Orders"}
              </button>
            </div>
          </section>
          ) : null}

          {activeTab === "general-info" ? (
            <section className="mx-auto w-full max-w-5xl">
              <section className="rounded-2xl border border-[#e8ddcf] bg-white/70 p-4 shadow-sm backdrop-blur lg:p-5">
                <h2 className="font-semibold">Categories</h2>
                <p className="mt-1 text-xs text-[#6b625b]">
                  Build the hierarchy used to classify products.
                </p>
                <form onSubmit={createCategory} className="mt-4 space-y-3 text-sm">
                  <input
                    type="text"
                    value={categoryForm.name}
                    onChange={(event) =>
                      setCategoryForm((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Category name (e.g., Ilkal Sarees)"
                    className="w-full rounded-xl border border-[#d7c9b7] p-2"
                  />
                  <select
                    value={categoryForm.parentId}
                    onChange={(event) =>
                      setCategoryForm((prev) => ({
                        ...prev,
                        parentId: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-[#d7c9b7] bg-white p-2"
                  >
                    <option value="">No parent (root category)</option>
                    {flatCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {`${"\u00A0\u00A0".repeat(category.depth)}${category.name}`}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={categorySaving}
                    className="w-full rounded-full bg-wine py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {categorySaving ? "Saving..." : "Create Category"}
                  </button>
                </form>
                <div className="mt-5 border-t border-[#eee5dc] pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#5c4a42]">
                    Category Hierarchy
                  </h3>
                  {loadingCategories ? (
                    <p className="mt-3 text-xs text-[#6b625b]">Loading categories...</p>
                  ) : null}
                  {!loadingCategories && categories.length === 0 ? (
                    <p className="mt-3 text-xs text-[#6b625b]">No categories yet.</p>
                  ) : null}
                  {!loadingCategories && categories.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {flatCategories.map((category) => (
                        <div
                          key={category.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-[#efe4d7] bg-[#fcf8f2] px-3 py-2 text-sm text-[#5b5149]"
                          style={{ marginLeft: `${category.depth * 16}px` }}
                        >
                          <span className="min-w-0 break-words">
                            {categoryPathById.get(category.id) ?? category.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => void deleteCategory(category)}
                            disabled={categoryDeletingId === category.id}
                            aria-label={`Delete ${category.name}`}
                            title={`Delete ${category.name}`}
                            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            {categoryDeletingId === category.id ? (
                              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                            ) : (
                              <Trash2 aria-hidden="true" className="size-4" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </section>
              <section className="mt-6 rounded-2xl border border-[#e8ddcf] bg-white/70 p-4 shadow-sm backdrop-blur lg:p-5">
                <h2 className="font-semibold">Product Details</h2>
                <p className="mt-1 text-xs text-[#6b625b]">
                  Manage the Work, Occasion, and Care choices used when creating products.
                </p>
                <form onSubmit={createProductOption} className="mt-4 grid gap-2 sm:grid-cols-[150px_1fr_auto]">
                  <select
                    value={productOptionForm.type}
                    onChange={(event) => setProductOptionForm((previous) => ({
                      ...previous,
                      type: event.target.value as ProductOptionType,
                    }))}
                    className="rounded-xl border border-[#d7c9b7] bg-white p-2 text-sm"
                  >
                    {(Object.keys(PRODUCT_OPTION_LABELS) as ProductOptionType[]).map((type) => (
                      <option key={type} value={type}>{PRODUCT_OPTION_LABELS[type]}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={productOptionForm.name}
                    onChange={(event) => setProductOptionForm((previous) => ({ ...previous, name: event.target.value }))}
                    placeholder="Add an option"
                    className="rounded-xl border border-[#d7c9b7] p-2 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={productOptionSaving}
                    className="rounded-full bg-wine px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {productOptionSaving ? "Saving..." : "Add Option"}
                  </button>
                </form>
                <div className="mt-5 grid gap-3 lg:grid-cols-3">
                  {(Object.keys(PRODUCT_OPTION_LABELS) as ProductOptionType[]).map((type) => (
                    <div key={type} className="rounded-xl border border-[#eee4d7] bg-[#fcf8f2] p-3">
                      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5c4a42]">
                        {PRODUCT_OPTION_LABELS[type]}
                      </h3>
                      <div className="mt-2 space-y-1.5">
                        {productOptions.filter((option) => option.type === type).map((option) => (
                          <div key={option.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-xs text-[#5b5149]">
                            <span className="min-w-0 break-words">{option.name}</span>
                            <button
                              type="button"
                              onClick={() => void deleteProductOption(option)}
                              disabled={productOptionDeletingId === option.id}
                              aria-label={`Delete ${option.name}`}
                              title={`Delete ${option.name}`}
                              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              {productOptionDeletingId === option.id ? (
                                <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
                              ) : (
                                <Trash2 aria-hidden="true" className="size-3.5" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </section>
          ) : null}
        </div>

        {activeTab === "inventory" ? (
          <section className="space-y-2">
            <h2 className="font-semibold">Quick-Stock</h2>
            <div className="grid gap-2 rounded-2xl border border-[#e8ddcf] bg-white p-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <input
                type="text"
                value={inventoryQuery}
                onChange={(event) => setInventoryQuery(event.target.value)}
                placeholder="Search product name"
                className="w-full rounded-xl border border-[#d7c9b7] p-2 text-sm"
              />
              <select
                value={inventoryFilter}
                onChange={(event) =>
                  setInventoryFilter(
                    event.target.value as "ALL" | "IN_STOCK" | "SOLD_OUT",
                  )
                }
                className="rounded-xl border border-[#d7c9b7] bg-white p-2 text-sm"
              >
                <option value="ALL">All Status</option>
                <option value="IN_STOCK">In Stock</option>
                <option value="SOLD_OUT">Sold Out</option>
              </select>
            </div>
            {loadingProducts ? (
              <p className="text-sm text-[#6b625b]">Loading products...</p>
            ) : null}
            {!loadingProducts && products.length === 0 ? (
              <p className="text-sm text-[#6b625b]">
                No products yet. Add your first product above.
              </p>
            ) : null}
            {!loadingProducts && filteredInventoryProducts.length === 0 ? (
              <p className="rounded-xl border border-[#e8ddcf] bg-white px-3 py-2 text-sm text-[#6b625b]">
                No products match this search/filter.
              </p>
            ) : null}
            {filteredInventoryProducts.map((product) => (
              <details
                key={product.id}
                className="rounded-2xl border border-[#e8ddcf] bg-white px-4 py-3 text-sm"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-2 list-none">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{product.name}</p>
                    <p className="text-xs text-[#6b625b]">
                      Colors: {product.colors.length} | Categories: {product.categories.length} | Product images: {product.images?.length ?? 0}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      product.stockStatus === "IN_STOCK"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {product.stockStatus === "IN_STOCK" ? "In Stock" : "Sold Out"}
                  </span>
                </summary>

                <div className="mt-3 space-y-3 border-t border-[#f0e7dc] pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void toggleStock(product)}
                      disabled={stockUpdatingId === product.id}
                      className="rounded-full border border-[#d7c9b7] px-3 py-1 text-xs"
                    >
                      {stockUpdatingId === product.id
                        ? "Updating..."
                        : product.stockStatus === "IN_STOCK"
                          ? "Mark Sold Out"
                          : "Mark In Stock"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHideDeleteConfirmProductId(product.id);
                        setHideDeleteAction("hide");
                      }}
                      className="rounded-full border border-amber-300 px-3 py-1 text-xs text-amber-700 hover:bg-amber-50"
                    >
                      Hide
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHideDeleteConfirmProductId(product.id);
                        setHideDeleteAction("delete");
                      }}
                      className="rounded-full border border-rose-300 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="space-y-2 rounded-xl border border-[#eee3d5] bg-[#fcf8f2] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5b5149]">
                        Categories
                      </p>
                      <span className="text-[11px] text-[#6b625b]">
                        {product.categories.length === 0
                          ? "Uncategorized"
                          : `${product.categories.length} selected`}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#6b625b]">
                      Selecting a sub-category auto-selects all parents. Unselecting a parent removes its sub-categories.
                    </p>
                    {flatCategories.length === 0 ? (
                      <p className="text-xs text-[#6b625b]">
                        No categories available. Add categories first.
                      </p>
                    ) : (
                      <div className="max-h-44 overflow-y-auto pr-1">
                        <CategoryTreeSelector
                          nodes={categories}
                          selectedCategoryIds={product.categories.map(
                            (item) => item.id,
                          )}
                          onToggle={(categoryId, checked) =>
                            toggleInventoryProductCategory(
                              product,
                              categoryId,
                              checked,
                            )
                          }
                          disabled={productCategorySavingId === product.id}
                        />
                      </div>
                    )}
                    {product.categories.length > 0 ? (
                      <p className="text-[11px] text-[#6b625b]">
                        {product.categories
                          .map(
                            (category) =>
                              categoryPathById.get(category.id) ?? category.name,
                          )
                          .join(" | ")}
                      </p>
                    ) : null}
                  </div>

                  <p className="text-xs text-[#6b625b]">
                    Product images: {product.images?.length ?? 0}
                  </p>
                  {(product.images?.length ?? 0) > 0 ? (
                    <div className="space-y-2 rounded-xl border border-[#eee3d5] p-2">
                      <p className="text-[11px] text-[#6b625b]">
                        Drag thumbnails to reorder.
                      </p>
                      {(product.images ?? [])
                        .slice()
                        .sort((a, b) => a.sortOrder - b.sortOrder)
                        .map((image, idx) => (
                          <div
                            key={image.id}
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData(
                                "text/product-image-id",
                                image.id,
                              );
                            }}
                            onDragOver={(event) => {
                              event.preventDefault();
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              const draggedImageId = event.dataTransfer.getData(
                                "text/product-image-id",
                              );
                              void reorderProductImagesByDrop(
                                product.id,
                                draggedImageId,
                                image.id,
                              );
                            }}
                            className="flex cursor-move items-center gap-2"
                          >
                            <div className="relative">
                              <img
                                src={image.imageUrl}
                                alt={`${product.name} ${idx + 1}`}
                                className="h-14 w-14 rounded-md border border-[#e2d6c8] object-cover"
                              />
                              <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                {idx + 1}
                              </span>
                            </div>
                            <div className="ml-auto flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  void moveProductGalleryImageByStep(
                                    product.id,
                                    image.id,
                                    -1,
                                  )
                                }
                                disabled={
                                  reorderProductLoadingId === product.id ||
                                  idx === 0
                                }
                                className="rounded border border-[#d7c9b7] px-1.5 py-0.5 text-[10px] disabled:opacity-40"
                              >
                                Prev
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void moveProductGalleryImageByStep(
                                    product.id,
                                    image.id,
                                    1,
                                  )
                                }
                                disabled={
                                  reorderProductLoadingId === product.id ||
                                  idx === (product.images?.length ?? 0) - 1
                                }
                                className="rounded border border-[#d7c9b7] px-1.5 py-0.5 text-[10px] disabled:opacity-40"
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : null}
                  <div className="space-y-2 rounded-xl border border-[#eee3d5] p-2">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(event) =>
                        setAppendProductFiles((prev) => ({
                          ...prev,
                          [product.id]: Array.from(event.target.files ?? []),
                        }))
                      }
                      className="w-full rounded-lg border border-[#d7c9b7] p-2 text-xs"
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-[#6b625b]">
                        Selected: {(appendProductFiles[product.id] ?? []).length}
                      </p>
                      <button
                        type="button"
                        onClick={() => void appendProductImages(product.id)}
                        disabled={
                          appendProductLoadingId === product.id ||
                          (appendProductFiles[product.id] ?? []).length === 0
                        }
                        className="rounded-full border border-[#d7c9b7] px-3 py-1 text-xs disabled:opacity-50"
                      >
                        {appendProductLoadingId === product.id
                          ? "Appending..."
                          : "Append Product Images"}
                      </button>
                    </div>
                    {(appendProductFiles[product.id] ?? []).length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-[11px] text-[#6b625b]">
                          Photos are optimized on your device before upload.
                        </p>
                        <div className="grid grid-cols-4 gap-2">
                          {(appendProductFiles[product.id] ?? []).map(
                            (file, idx) => {
                              const previewUrl = getPreviewUrl(file);
                              return (
                                <div
                                  key={`${file.name}-${idx}`}
                                  draggable
                                  onDragStart={(event) => {
                                    event.dataTransfer.setData(
                                      "text/append-product-index",
                                      String(idx),
                                    );
                                  }}
                                  onDragOver={(event) => {
                                    event.preventDefault();
                                  }}
                                  onDrop={(event) => {
                                    event.preventDefault();
                                    const sourceIndex = Number(
                                      event.dataTransfer.getData(
                                        "text/append-product-index",
                                      ),
                                    );
                                    if (Number.isFinite(sourceIndex)) {
                                      reorderAppendProductImageByDrop(
                                        product.id,
                                        sourceIndex,
                                        idx,
                                      );
                                    }
                                  }}
                                  className="space-y-1 cursor-move"
                                >
                                  <div className="relative">
                                    <img
                                      src={previewUrl}
                                      alt={`Append product ${idx + 1}`}
                                      className="h-14 w-full rounded-md border border-[#e2d6c8] object-cover"
                                    />
                                    <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                      {idx + 1}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-[#6b625b]">
                                    Drag to reorder
                                  </p>
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        moveAppendProductImageByStep(
                                          product.id,
                                          idx,
                                          -1,
                                        )
                                      }
                                      disabled={idx === 0}
                                      className="w-full rounded border border-[#d7c9b7] px-1 py-0.5 text-[10px] disabled:opacity-40"
                                    >
                                      Prev
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        moveAppendProductImageByStep(
                                          product.id,
                                          idx,
                                          1,
                                        )
                                      }
                                      disabled={
                                        idx ===
                                        (appendProductFiles[product.id] ?? [])
                                          .length -
                                          1
                                      }
                                      className="w-full rounded border border-[#d7c9b7] px-1 py-0.5 text-[10px] disabled:opacity-40"
                                    >
                                      Next
                                    </button>
                                  </div>
                                </div>
                              );
                            },
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    {product.colors.length === 0 ? (
                      <p className="text-xs text-[#6b625b]">No colors yet.</p>
                    ) : null}
                    {product.colors.map((color) => (
                      <details
                        key={color.id}
                        className="rounded-xl border border-[#eee3d5] px-3 py-2"
                      >
                        <summary className="flex cursor-pointer items-center justify-between gap-2 list-none">
                          <div>
                            <p className="text-sm font-medium text-ink">{color.name}</p>
                            <p className="text-xs text-[#6b625b]">
                              Qty {color.stockQuantity} {color.isDefault ? "| Default" : ""} | Images {color.images?.length ?? 0}
                            </p>
                            {color.sku ? (
                              <p className="mt-0.5 font-mono text-[11px] tracking-wide text-[#8a7560]">{color.sku}</p>
                            ) : null}
                            {color.borderColorName ? (
                              <p className="text-[11px] text-[#8a7560]">Border: {color.borderColorName}</p>
                            ) : null}
                          </div>
                          <span className="rounded-full bg-[#f7f1e8] px-2 py-1 text-[11px] font-semibold text-[#5b5149]">
                            Manage
                          </span>
                        </summary>

                        <div className="mt-3 space-y-2 border-t border-[#f0e7dc] pt-3">
                          {(color.images?.length ?? 0) > 0 ? (
                            <div className="mt-2 space-y-2 rounded-xl border border-[#eee3d5] p-2">
                              <p className="text-[11px] text-[#6b625b]">
                                Drag thumbnails to reorder.
                              </p>
                              {(color.images ?? [])
                                .slice()
                                .sort((a, b) => a.sortOrder - b.sortOrder)
                                .map((image, idx) => (
                                  <div
                                    key={image.id}
                                    draggable
                                    onDragStart={(event) => {
                                      event.dataTransfer.setData(
                                        "text/color-image-id",
                                        image.id,
                                      );
                                    }}
                                    onDragOver={(event) => {
                                      event.preventDefault();
                                    }}
                                    onDrop={(event) => {
                                      event.preventDefault();
                                      const draggedImageId =
                                        event.dataTransfer.getData(
                                          "text/color-image-id",
                                        );
                                      void reorderColorImagesByDrop(
                                        product.id,
                                        color.id,
                                        draggedImageId,
                                        image.id,
                                      );
                                    }}
                                    className="flex cursor-move items-center gap-2"
                                  >
                                    <div className="relative">
                                      <img
                                        src={image.imageUrl}
                                        alt={`${color.name} ${idx + 1}`}
                                        className="h-12 w-12 rounded-md border border-[#e2d6c8] object-cover"
                                      />
                                      <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                        {idx + 1}
                                      </span>
                                    </div>
                                    <div className="ml-auto flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void moveColorGalleryImageByStep(
                                            product.id,
                                            color.id,
                                            image.id,
                                            -1,
                                          )
                                        }
                                        disabled={
                                          reorderColorLoadingId === color.id ||
                                          idx === 0
                                        }
                                        className="rounded border border-[#d7c9b7] px-1.5 py-0.5 text-[10px] disabled:opacity-40"
                                      >
                                        Prev
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void moveColorGalleryImageByStep(
                                            product.id,
                                            color.id,
                                            image.id,
                                            1,
                                          )
                                        }
                                        disabled={
                                          reorderColorLoadingId === color.id ||
                                          idx === (color.images?.length ?? 0) - 1
                                        }
                                        className="rounded border border-[#d7c9b7] px-1.5 py-0.5 text-[10px] disabled:opacity-40"
                                      >
                                        Next
                                      </button>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          ) : null}
                          <div className="mt-2 space-y-2">
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={(event) =>
                                setAppendColorFiles((prev) => ({
                                  ...prev,
                                  [color.id]: Array.from(event.target.files ?? []),
                                }))
                              }
                              className="w-full rounded-lg border border-[#d7c9b7] p-2 text-xs"
                            />
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-[#6b625b]">
                                Selected: {(appendColorFiles[color.id] ?? []).length}
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  void appendColorImages(product.id, color.id)
                                }
                                disabled={
                                  appendColorLoadingId === color.id ||
                                  (appendColorFiles[color.id] ?? []).length === 0
                                }
                                className="rounded-full border border-[#d7c9b7] px-3 py-1 text-xs disabled:opacity-50"
                              >
                                {appendColorLoadingId === color.id
                                  ? "Appending..."
                                  : "Append Color Images"}
                              </button>
                            </div>
                            {(appendColorFiles[color.id] ?? []).length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-[11px] text-[#6b625b]">
                                  Photos are optimized on your device before upload.
                                </p>
                                <div className="grid grid-cols-4 gap-2">
                                  {(appendColorFiles[color.id] ?? []).map(
                                    (file, idx) => {
                                      const previewUrl = getPreviewUrl(file);
                                      return (
                                        <div
                                          key={`${file.name}-${idx}`}
                                          draggable
                                          onDragStart={(event) => {
                                            event.dataTransfer.setData(
                                              "text/append-color-index",
                                              String(idx),
                                            );
                                          }}
                                          onDragOver={(event) => {
                                            event.preventDefault();
                                          }}
                                          onDrop={(event) => {
                                            event.preventDefault();
                                            const sourceIndex = Number(
                                              event.dataTransfer.getData(
                                                "text/append-color-index",
                                              ),
                                            );
                                            if (Number.isFinite(sourceIndex)) {
                                              reorderAppendColorImageByDrop(
                                                color.id,
                                                sourceIndex,
                                                idx,
                                              );
                                            }
                                          }}
                                          className="space-y-1 cursor-move"
                                        >
                                          <div className="relative">
                                            <img
                                              src={previewUrl}
                                              alt={`Append color ${idx + 1}`}
                                              className="h-12 w-full rounded-md border border-[#e2d6c8] object-cover"
                                            />
                                            <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                              {idx + 1}
                                            </span>
                                          </div>
                                          <p className="text-[10px] text-[#6b625b]">
                                            Drag to reorder
                                          </p>
                                          <div className="flex gap-1">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                moveAppendColorImageByStep(
                                                  color.id,
                                                  idx,
                                                  -1,
                                                )
                                              }
                                              disabled={idx === 0}
                                              className="w-full rounded border border-[#d7c9b7] px-1 py-0.5 text-[10px] disabled:opacity-40"
                                            >
                                              Prev
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                moveAppendColorImageByStep(
                                                  color.id,
                                                  idx,
                                                  1,
                                                )
                                              }
                                              disabled={
                                                idx ===
                                                (appendColorFiles[color.id] ?? [])
                                                  .length -
                                                  1
                                              }
                                              className="w-full rounded border border-[#d7c9b7] px-1 py-0.5 text-[10px] disabled:opacity-40"
                                            >
                                              Next
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    },
                                  )}
                                </div>
                              </div>
                            ) : null}
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void toggleColorStock(product.id, color)}
                              disabled={stockUpdatingId === color.id}
                              className="rounded-full border border-[#d7c9b7] px-3 py-1 text-xs"
                            >
                              {stockUpdatingId === color.id
                                ? "..."
                                : color.stockQuantity > 0
                                  ? "Set OOS"
                                  : "Restock (Toggle)"}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void setDefaultColor(product.id, color.id)
                              }
                              disabled={
                                defaultUpdatingId === color.id || color.isDefault
                              }
                              className="rounded-full border border-[#d7c9b7] px-3 py-1 text-xs disabled:opacity-50"
                            >
                              {defaultUpdatingId === color.id
                                ? "..."
                                : color.isDefault
                                  ? "Default"
                                  : "Set Default"}
                            </button>
                          </div>

                          <div className="mt-3 rounded-xl border border-[#eee3d5] bg-[#fcf8f2] p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5b5149]">
                              Bulk Restock
                            </p>
                            <p className="mt-1 text-[11px] text-[#6b625b]">
                              Add multiple pieces in one go
                            </p>
                            <div className="mt-2 flex gap-2">
                              <input
                                type="number"
                                min="1"
                                value={restockingColorId === color.id ? restockQuantity : ""}
                                onChange={(e) => {
                                  if (restockingColorId === color.id) {
                                    setRestockQuantity(e.target.value);
                                  } else {
                                    setRestockingColorId(color.id);
                                    setRestockQuantity(e.target.value);
                                  }
                                }}
                                placeholder="Qty"
                                className="w-20 rounded-lg border border-[#d7c9b7] p-1.5 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const qty = Number(restockQuantity);
                                  if (qty > 0) {
                                    void restockColor(product.id, color.id, qty);
                                  }
                                }}
                                disabled={
                                  restockingColorId === color.id && !restockQuantity
                                }
                                className="rounded-full border border-emerald-300 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                {restockingColorId === color.id ? "Adding..." : "Add Pieces"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </section>
        ) : null}

        {activeTab === "pieces" ? (
          <section className="space-y-3">
            <h2 className="font-semibold">Physical Pieces</h2>
            {pieces.length === 0 && !piecesLoading ? (
              <p className="rounded-xl border border-[#e8ddcf] bg-white px-3 py-2 text-sm text-[#6b625b]">
                Select a product and colour variant, then click Load Pieces.
              </p>
            ) : null}
            {piecesLoading ? (
              <p className="text-sm text-[#6b625b]">Loading pieces...</p>
            ) : null}
            {pieces.length > 0 ? (
              <>
                {piecesSku ? (
                  <div className="rounded-2xl border border-[#e8ddcf] bg-white p-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[#6b625b]">Colour SKU</p>
                    <p className="mt-1 font-mono text-sm font-semibold text-ink">{piecesSku}</p>
                  </div>
                ) : null}
                <div className="overflow-hidden rounded-2xl border border-[#e8ddcf] bg-white">
                  <table className="w-full text-sm">
                    <thead className="border-b border-[#f0e7dc] bg-[#fcf8f2]">
                      <tr>
                        <th className="px-3 py-2 text-left text-[11px] uppercase tracking-[0.12em] text-[#6b625b]">#</th>
                        <th className="px-3 py-2 text-left text-[11px] uppercase tracking-[0.12em] text-[#6b625b]">Serial</th>
                        <th className="px-3 py-2 text-left text-[11px] uppercase tracking-[0.12em] text-[#6b625b]">Status</th>
                        <th className="px-3 py-2 text-left text-[11px] uppercase tracking-[0.12em] text-[#6b625b]">Sticker</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f7f1e8]">
                      {pieces.map((piece) => (
                        <tr key={piece.id}>
                          <td className="px-3 py-2 text-xs text-[#6b625b]">{piece.pieceNumber}</td>
                          <td className="px-3 py-2 font-mono text-xs text-ink">{piece.serial}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              piece.status === "AVAILABLE" ? "bg-emerald-100 text-emerald-700" :
                              piece.status === "SOLD" ? "bg-rose-100 text-rose-700" :
                              piece.status === "RETURNED" ? "bg-amber-100 text-amber-700" :
                              "bg-[#f7f1e8] text-[#6b625b]"
                            }`}>
                              {piece.status}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <a
                              href={`${ADMIN_PROXY_BASE}/pieces/${piece.serial}/qr`}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-full border border-[#d7c9b7] px-2.5 py-1 text-[11px] font-semibold hover:bg-[#faf5ef]"
                            >
                              QR
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-[#6b625b]">
                  Click QR to open the piece&apos;s QR code image in a new tab. Print it and attach to the physical saree.
                </p>
              </>
            ) : null}
          </section>
        ) : null}

        {activeTab === "orders" ? (
          <section className="space-y-4">
            {gstReport ? (
              <div className="rounded-2xl border border-[#e8ddcf] bg-white p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">GSTR-1 B2CS Summary — {gstReport.month}</h3>
                  <span className="text-xs text-[#6b625b]">{gstReport.invoiceCount} invoices</span>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-[#f0e7dc] bg-[#fcf8f2]">
                      <tr>
                        <th className="px-2 py-1.5 text-left tracking-[0.1em] text-[#6b625b]">State</th>
                        <th className="px-2 py-1.5 text-right tracking-[0.1em] text-[#6b625b]">Rate</th>
                        <th className="px-2 py-1.5 text-right tracking-[0.1em] text-[#6b625b]">Taxable</th>
                        <th className="px-2 py-1.5 text-right tracking-[0.1em] text-[#6b625b]">CGST</th>
                        <th className="px-2 py-1.5 text-right tracking-[0.1em] text-[#6b625b]">SGST</th>
                        <th className="px-2 py-1.5 text-right tracking-[0.1em] text-[#6b625b]">IGST</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f7f1e8]">
                      {gstReport.b2cs.map((row, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5 capitalize">{row.placeOfSupply}</td>
                          <td className="px-2 py-1.5 text-right">{row.gstRatePercent}%</td>
                          <td className="px-2 py-1.5 text-right">{formatInr(row.taxableAmountInPaise)}</td>
                          <td className="px-2 py-1.5 text-right">{formatInr(row.cgstInPaise)}</td>
                          <td className="px-2 py-1.5 text-right">{formatInr(row.sgstInPaise)}</td>
                          <td className="px-2 py-1.5 text-right">{formatInr(row.igstInPaise)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-[#e8ddcf] font-semibold">
                      <tr>
                        <td className="px-2 py-1.5" colSpan={2}>Total</td>
                        <td className="px-2 py-1.5 text-right">{formatInr(gstReport.totals.taxableAmountInPaise)}</td>
                        <td className="px-2 py-1.5 text-right">{formatInr(gstReport.totals.cgstInPaise)}</td>
                        <td className="px-2 py-1.5 text-right">{formatInr(gstReport.totals.sgstInPaise)}</td>
                        <td className="px-2 py-1.5 text-right">{formatInr(gstReport.totals.igstInPaise)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ) : null}

            <h3 className="font-semibold">All Orders</h3>
            {ordersLoading ? (
              <p className="text-sm text-[#6b625b]">Loading orders...</p>
            ) : null}
            {!ordersLoading && orders.length === 0 ? (
              <p className="rounded-xl border border-[#e8ddcf] bg-white px-3 py-2 text-sm text-[#6b625b]">No orders yet.</p>
            ) : null}
            {orders.map((order) => (
              <div key={order.id} className="rounded-2xl border border-[#e8ddcf] bg-white p-4 text-sm">
                <div
                  className="flex cursor-pointer items-start justify-between gap-2"
                  onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{order.customerName}</p>
                    <p className="text-xs text-[#6b625b]">{order.customerEmail} · {order.deliveryState ?? "—"}</p>
                    {order.invoiceNumber ? (
                      <p className="mt-0.5 font-mono text-xs text-[#8a7560]">{order.invoiceNumber}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      order.status === "PAID" ? "bg-emerald-100 text-emerald-700" :
                      order.status === "PENDING" ? "bg-amber-100 text-amber-700" :
                      "bg-rose-100 text-rose-700"
                    }`}>{order.status}</span>
                    <span className="text-xs font-semibold text-ink">{formatInr(order.amountInPaise)}</span>
                  </div>
                </div>

                {expandedOrderId === order.id ? (
                  <div className="mt-3 space-y-3 border-t border-[#f0e7dc] pt-3 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.1em] text-[#6b625b]">Taxable</p>
                        <p className="font-semibold">{formatInr(order.taxableAmountInPaise)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.1em] text-[#6b625b]">CGST</p>
                        <p className="font-semibold">{formatInr(order.cgstInPaise)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.1em] text-[#6b625b]">SGST</p>
                        <p className="font-semibold">{formatInr(order.sgstInPaise)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.1em] text-[#6b625b]">IGST</p>
                        <p className="font-semibold">{formatInr(order.igstInPaise)}</p>
                      </div>
                    </div>
                    <table className="w-full">
                      <thead className="border-b border-[#f0e7dc] bg-[#fcf8f2]">
                        <tr>
                          <th className="px-2 py-1 text-left text-[10px] uppercase tracking-[0.1em] text-[#6b625b]">Product</th>
                          <th className="px-2 py-1 text-left text-[10px] uppercase tracking-[0.1em] text-[#6b625b]">SKU</th>
                          <th className="px-2 py-1 text-right text-[10px] uppercase tracking-[0.1em] text-[#6b625b]">Qty</th>
                          <th className="px-2 py-1 text-right text-[10px] uppercase tracking-[0.1em] text-[#6b625b]">HSN</th>
                          <th className="px-2 py-1 text-right text-[10px] uppercase tracking-[0.1em] text-[#6b625b]">GST%</th>
                          <th className="px-2 py-1 text-right text-[10px] uppercase tracking-[0.1em] text-[#6b625b]">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f7f1e8]">
                        {order.items.map((item) => (
                          <tr key={item.id}>
                            <td className="px-2 py-1">{item.product.name}</td>
                            <td className="px-2 py-1 font-mono">{item.productColor?.sku ?? "—"}</td>
                            <td className="px-2 py-1 text-right">{item.quantity}</td>
                            <td className="px-2 py-1 text-right">{item.hsnCode ?? "—"}</td>
                            <td className="px-2 py-1 text-right">{item.gstRatePercent}%</td>
                            <td className="px-2 py-1 text-right">{formatInr(item.priceAtTime * item.quantity)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {order.invoiceNumber ? (
                      <a
                        href={`${ADMIN_PROXY_BASE}/orders/${order.id}/invoice`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-[#d7c9b7] px-3 py-1 text-xs font-semibold hover:bg-[#faf5ef]"
                      >
                        View Invoice JSON
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

      </div>
      ) : null}

      {hideDeleteConfirmProductId && hideDeleteAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-2xl bg-white p-6 shadow-lg max-w-sm mx-4">
            <h3 className="font-semibold text-lg text-ink">
              {hideDeleteAction === "hide" ? "Hide Product?" : "Delete Product?"}
            </h3>
            <p className="mt-2 text-sm text-[#5c4e44]">
              {hideDeleteAction === "hide"
                ? "This product will be hidden from listings and won't appear to customers."
                : "This product will be permanently deleted. This action cannot be undone. (Products with paid orders cannot be deleted.)"}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setHideDeleteConfirmProductId(null);
                  setHideDeleteAction(null);
                }}
                className="flex-1 rounded-full border border-[#d7c9b7] px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (hideDeleteAction === "hide") {
                    void hideProduct(hideDeleteConfirmProductId);
                  } else {
                    void deleteProduct(hideDeleteConfirmProductId);
                  }
                }}
                disabled={stockUpdatingId === hideDeleteConfirmProductId}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold text-white ${
                  hideDeleteAction === "hide"
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-rose-600 hover:bg-rose-700"
                } disabled:opacity-50`}
              >
                {hideDeleteAction === "hide" ? "Hide" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
