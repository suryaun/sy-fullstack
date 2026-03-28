"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { getPublicApiUrl } from "@/lib/publicApiUrl";

type StockState = "IN_STOCK" | "SOLD_OUT";

type AdminImage = {
  id: string;
  imageUrl: string;
  sortOrder: number;
};

type AdminColor = {
  id: string;
  name: string;
  stockQuantity: number;
  isDefault: boolean;
  images?: AdminImage[];
};

type AdminProduct = {
  id: string;
  name: string;
  stockStatus: StockState;
  images?: AdminImage[];
  colors: AdminColor[];
};

type ProductForm = {
  name: string;
  description: string;
  fabric:
    | "SILK"
    | "CHIFFON"
    | "COTTON"
    | "GEORGETTE"
    | "ORGANZA"
    | "LINEN"
    | "CREPE"
    | "SATIN";
  craft:
    | "BANARASI"
    | "KANJEEVARAM"
    | "BANDHANI"
    | "CHIKANKARI"
    | "PAITHANI"
    | "PATOLA"
    | "JAMDANI"
    | "TUSSAR";
  lengthInMeters: string;
  blouseIncluded: boolean;
  priceInInr: string;
};

type ColorForm = {
  productId: string;
  name: string;
  colorCode: string;
  stockQuantity: string;
  isDefault: boolean;
};

const ADMIN_UPLOAD_MAX_DIMENSION = 2200;
const ADMIN_UPLOAD_TARGET_BYTES = 4 * 1024 * 1024;
const ADMIN_UPLOAD_MIN_QUALITY = 0.62;

function getAdminTokenFromCookie() {
  if (typeof document === "undefined") {
    return "";
  }

  const raw = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("admin_token="));

  return raw ? decodeURIComponent(raw.split("=")[1] ?? "") : "";
}

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
  const previewUrlCacheRef = useRef<Map<File, string>>(new Map());
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [stockUpdatingId, setStockUpdatingId] = useState<string | null>(null);
  const [defaultUpdatingId, setDefaultUpdatingId] = useState<string | null>(
    null,
  );
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
    fabric: "SILK",
    craft: "BANARASI",
    lengthInMeters: "5.5",
    blouseIncluded: true,
    priceInInr: "",
  });
  const [colorForm, setColorForm] = useState<ColorForm>({
    productId: "",
    name: "",
    colorCode: "",
    stockQuantity: "0",
    isDefault: false,
  });

  const isSubmitDisabled = useMemo(() => {
    return (
      saving ||
      productImageFiles.length === 0 ||
      !form.name.trim() ||
      !form.description.trim() ||
      !form.priceInInr ||
      Number(form.priceInInr) <= 0 ||
      Number(form.lengthInMeters) <= 0
    );
  }, [saving, productImageFiles.length, form]);

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

  const uploadManyImages = async (files: File[], adminToken: string) => {
    const apiUrl = getPublicApiUrl();
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

      const uploadRes = await fetch(`${apiUrl}/api/admin/upload/imagekit`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
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

  const loadProducts = async (adminToken: string) => {
    const apiUrl = getPublicApiUrl();
    const response = await fetch(`${apiUrl}/api/admin/products`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    if (!response.ok) {
      throw new Error("Unable to load products");
    }

    const data = (await response.json()) as AdminProduct[];
    setProducts(data);
    if (data[0] && !colorForm.productId) {
      setColorForm((prev) => ({ ...prev, productId: data[0].id }));
    }
  };

  useEffect(() => {
    const bootstrapAndLoadProducts = async () => {
      const bootstrap = await fetch("/api/admin/bootstrap", {
        method: "POST",
      });

      if (!bootstrap.ok) {
        const payload = await bootstrap.json().catch(() => ({}));
        setLoadingProducts(false);
        setStatus(payload.message ?? "Admin access denied");
        return;
      }

      const adminToken = getAdminTokenFromCookie();
      if (!adminToken) {
        setLoadingProducts(false);
        setStatus("Unable to create admin session");
        return;
      }

      try {
        await loadProducts(adminToken);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to load products";
        setStatus(message);
      } finally {
        setLoadingProducts(false);
      }
    };

    void bootstrapAndLoadProducts();
  }, []);

  const toggleStock = async (product: AdminProduct) => {
    const adminToken = getAdminTokenFromCookie();
    if (!adminToken) {
      setStatus("Admin token missing. Please sign in again.");
      return;
    }

    const nextStock: StockState =
      product.stockStatus === "IN_STOCK" ? "SOLD_OUT" : "IN_STOCK";

    try {
      setStockUpdatingId(product.id);

      const response = await fetch(
        `${getPublicApiUrl()}/api/admin/products/${product.id}/stock`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
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
    const adminToken = getAdminTokenFromCookie();
    if (!adminToken) {
      setStatus("Admin token missing. Please sign in again.");
      return;
    }

    const nextStock = color.stockQuantity > 0 ? 0 : 1;

    try {
      setStockUpdatingId(color.id);
      const response = await fetch(
        `${getPublicApiUrl()}/api/admin/products/${productId}/colors/${color.id}/stock`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
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

  const setDefaultColor = async (productId: string, colorId: string) => {
    const adminToken = getAdminTokenFromCookie();
    if (!adminToken) {
      setStatus("Admin token missing. Please sign in again.");
      return;
    }

    try {
      setDefaultUpdatingId(colorId);
      const response = await fetch(
        `${getPublicApiUrl()}/api/admin/products/${productId}/colors/${colorId}/default`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
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

    const adminToken = getAdminTokenFromCookie();
    if (!adminToken) {
      setStatus("Admin token missing. Please sign in again.");
      return;
    }

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
          ? await uploadManyImages(colorImageFiles, adminToken)
          : [];

      const response = await fetch(
        `${getPublicApiUrl()}/api/admin/products/${colorForm.productId}/colors`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: colorForm.name.trim(),
            colorCode: colorForm.colorCode.trim() || undefined,
            stockQuantity: Math.max(0, Number(colorForm.stockQuantity || 0)),
            isDefault: colorForm.isDefault,
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
        stockQuantity: "0",
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

  const createProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (productImageFiles.length === 0) {
      setStatus("Please select at least one product image");
      return;
    }

    const adminToken = getAdminTokenFromCookie();
    if (!adminToken) {
      setStatus("Admin token missing. Please sign in again.");
      return;
    }

    try {
      setSaving(true);
      setStatus("Optimizing and uploading product images...");

      const uploadedImages = await uploadManyImages(
        productImageFiles,
        adminToken,
      );

      setStatus("Creating product...");

      const apiUrl = getPublicApiUrl();

      const productRes = await fetch(`${apiUrl}/api/admin/products`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim(),
          fabric: form.fabric,
          craft: form.craft,
          lengthInMeters: Number(form.lengthInMeters),
          blouseIncluded: form.blouseIncluded,
          priceInPaise: Math.round(Number(form.priceInInr) * 100),
          imageUrl: uploadedImages[0]?.imageUrl,
          imagePublicId: uploadedImages[0]?.imagePublicId,
          imageUploads: uploadedImages,
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
        priceInInr: "",
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

    const adminToken = getAdminTokenFromCookie();
    if (!adminToken) {
      setStatus("Admin token missing. Please sign in again.");
      return;
    }

    try {
      setAppendProductLoadingId(productId);
      setStatus("Optimizing, uploading, and appending product images...");
      const uploads = await uploadManyImages(files, adminToken);

      const response = await fetch(
        `${getPublicApiUrl()}/api/admin/products/${productId}/images`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ imageUploads: uploads }),
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message ?? "Failed to append product images");
      }

      await loadProducts(adminToken);
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

    const adminToken = getAdminTokenFromCookie();
    if (!adminToken) {
      setStatus("Admin token missing. Please sign in again.");
      return;
    }

    try {
      setAppendColorLoadingId(colorId);
      setStatus("Optimizing, uploading, and appending color images...");
      const uploads = await uploadManyImages(files, adminToken);

      const response = await fetch(
        `${getPublicApiUrl()}/api/admin/products/${productId}/colors/${colorId}/images`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ imageUploads: uploads }),
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message ?? "Failed to append color images");
      }

      await loadProducts(adminToken);
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

    const adminToken = getAdminTokenFromCookie();
    if (!adminToken) {
      setStatus("Admin token missing. Please sign in again.");
      return;
    }

    try {
      setReorderProductLoadingId(productId);
      const response = await fetch(
        `${getPublicApiUrl()}/api/admin/products/${productId}/images/reorder`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
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

      await loadProducts(adminToken);
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

    const adminToken = getAdminTokenFromCookie();
    if (!adminToken) {
      setStatus("Admin token missing. Please sign in again.");
      return;
    }

    try {
      setReorderColorLoadingId(colorId);
      const response = await fetch(
        `${getPublicApiUrl()}/api/admin/products/${productId}/colors/${colorId}/images/reorder`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
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

      await loadProducts(adminToken);
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
    <main className="mx-auto max-w-md space-y-6 px-4 pb-24 pt-8">
      <h1 className="font-serif text-4xl">Admin | Mobile</h1>

      <section className="rounded-2xl border border-[#e8ddcf] bg-white/70 p-4 shadow-sm backdrop-blur">
        <h2 className="font-semibold">Add Item</h2>
        <form onSubmit={createProduct} className="mt-3 space-y-3 text-sm">
          <input
            type="text"
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
            placeholder="Product name"
            className="w-full rounded-xl border border-[#d7c9b7] p-2"
          />
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(event) =>
              setProductImageFiles(Array.from(event.target.files ?? []))
            }
            className="w-full rounded-xl border border-[#d7c9b7] p-2"
          />
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
                        onClick={() => moveSelectedProductImageByStep(idx, -1)}
                        disabled={idx === 0}
                        className="w-full rounded border border-[#d7c9b7] px-1 py-0.5 text-[10px] disabled:opacity-40"
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSelectedProductImageByStep(idx, 1)}
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
          <div className="grid grid-cols-2 gap-2">
            <select
              value={form.fabric}
              onChange={(event) =>
                updateField(
                  "fabric",
                  event.target.value as ProductForm["fabric"],
                )
              }
              className="w-full rounded-xl border border-[#d7c9b7] bg-white p-2"
            >
              <option value="SILK">Silk</option>
              <option value="CHIFFON">Chiffon</option>
              <option value="COTTON">Cotton</option>
              <option value="GEORGETTE">Georgette</option>
              <option value="ORGANZA">Organza</option>
              <option value="LINEN">Linen</option>
              <option value="CREPE">Crepe</option>
              <option value="SATIN">Satin</option>
            </select>
            <select
              value={form.craft}
              onChange={(event) =>
                updateField("craft", event.target.value as ProductForm["craft"])
              }
              className="w-full rounded-xl border border-[#d7c9b7] bg-white p-2"
            >
              <option value="BANARASI">Banarasi</option>
              <option value="KANJEEVARAM">Kanjeevaram</option>
              <option value="BANDHANI">Bandhani</option>
              <option value="CHIKANKARI">Chikankari</option>
              <option value="PAITHANI">Paithani</option>
              <option value="PATOLA">Patola</option>
              <option value="JAMDANI">Jamdani</option>
              <option value="TUSSAR">Tussar</option>
            </select>
          </div>
          <textarea
            value={form.description}
            onChange={(event) => updateField("description", event.target.value)}
            placeholder="Description"
            className="h-24 w-full rounded-xl border border-[#d7c9b7] p-2"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={form.lengthInMeters}
              onChange={(event) =>
                updateField("lengthInMeters", event.target.value)
              }
              placeholder="Length in meters"
              className="w-full rounded-xl border border-[#d7c9b7] p-2"
            />
            <input
              type="number"
              min="1"
              value={form.priceInInr}
              onChange={(event) =>
                updateField("priceInInr", event.target.value)
              }
              placeholder="Price in INR"
              className="w-full rounded-xl border border-[#d7c9b7] p-2"
            />
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
          {status ? <p className="text-xs text-[#6b625b]">{status}</p> : null}
        </form>
      </section>

      <section className="rounded-2xl border border-[#e8ddcf] bg-white/70 p-4 shadow-sm backdrop-blur">
        <h2 className="font-semibold">Add Color Variant</h2>
        <form onSubmit={addColorVariant} className="mt-3 space-y-3 text-sm">
          <select
            value={colorForm.productId}
            onChange={(event) =>
              setColorForm((prev) => ({
                ...prev,
                productId: event.target.value,
              }))
            }
            className="w-full rounded-xl border border-[#d7c9b7] bg-white p-2"
          >
            <option value="">Select product</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={colorForm.name}
              onChange={(event) =>
                setColorForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="Color name"
              className="w-full rounded-xl border border-[#d7c9b7] p-2"
            />
            <input
              type="text"
              value={colorForm.colorCode}
              onChange={(event) =>
                setColorForm((prev) => ({
                  ...prev,
                  colorCode: event.target.value,
                }))
              }
              placeholder="#RRGGBB (optional)"
              className="w-full rounded-xl border border-[#d7c9b7] p-2"
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
                        event.dataTransfer.getData("text/selected-color-index"),
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
                        onClick={() => moveSelectedColorImageByStep(idx, -1)}
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

      <section className="space-y-2">
        <h2 className="font-semibold">Quick-Stock</h2>
        {loadingProducts ? (
          <p className="text-sm text-[#6b625b]">Loading products...</p>
        ) : null}
        {!loadingProducts && products.length === 0 ? (
          <p className="text-sm text-[#6b625b]">
            No products yet. Add your first product above.
          </p>
        ) : null}
        {products.map((product) => (
          <article
            key={product.id}
            className="space-y-3 rounded-2xl border border-[#e8ddcf] bg-white px-4 py-3 text-sm"
          >
            <div className="flex items-center justify-between">
              <span className="max-w-[65%] truncate font-semibold">
                {product.name}
              </span>
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
                            reorderProductLoadingId === product.id || idx === 0
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
                    {(appendProductFiles[product.id] ?? []).map((file, idx) => {
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
                                moveAppendProductImageByStep(product.id, idx, 1)
                              }
                              disabled={
                                idx ===
                                (appendProductFiles[product.id] ?? []).length -
                                  1
                              }
                              className="w-full rounded border border-[#d7c9b7] px-1 py-0.5 text-[10px] disabled:opacity-40"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              {product.colors.length === 0 ? (
                <p className="text-xs text-[#6b625b]">No colors yet.</p>
              ) : null}
              {product.colors.map((color) => (
                <div
                  key={color.id}
                  className="flex items-center justify-between rounded-xl border border-[#eee3d5] px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{color.name}</p>
                    <p className="text-xs text-[#6b625b]">
                      Qty {color.stockQuantity}{" "}
                      {color.isDefault ? "| Default" : ""} | Images{" "}
                      {color.images?.length ?? 0}
                    </p>
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
                  </div>
                  <div className="flex gap-2">
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
                          : "Restock"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void setDefaultColor(product.id, color.id)}
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
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
