import { getPublicApiUrl } from "@/lib/publicApiUrl";

export type UserAddress = {
  id: string;
  customerId: string;
  fullName: string;
  phoneNumber: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  addressType: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AddressInput = {
  fullName: string;
  phoneNumber: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  addressType?: string;
  isDefault?: boolean;
};

export type UserOrderItem = {
  id: string;
  productId: string;
  productColorId: string | null;
  colorName: string | null;
  quantity: number;
  priceAtTime: number;
  productName: string;
  productImageUrl: string;
};

export type UserOrder = {
  id: string;
  paymentStatus: "PENDING" | "PAID" | "FAILED" | "CANCELLED";
  fulfillmentStatus: string | null;
  amountInPaise: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  createdAt: string;
  updatedAt: string;
  items: UserOrderItem[];
  deliveryAddress:
    | {
        fullName: string | null;
        phoneNumber: string | null;
        line1: string | null;
        line2: string | null;
        landmark: string | null;
        city: string | null;
        state: string | null;
        postalCode: string | null;
        country: string | null;
      }
    | null;
  shipment:
    | {
        courier: string | null;
        trackingNumber: string | null;
        trackingUrl: string | null;
        expectedDeliveryAt: string | null;
      }
    | null;
};

export async function createRazorpayOrder(payload: {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerUserId?: string;
  deliveryAddressId?: string;
  items: Array<{ productId: string; productColorId: string; quantity: number }>;
}) {
  const apiUrl = getPublicApiUrl();
  const response = await fetch(`${apiUrl}/api/payments/razorpay/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({}))) as {
      message?: string;
      unavailableItems?: Array<{
        productId: string;
        productName: string | null;
        productColorId: string;
        colorName: string | null;
        reason: string;
        requestedQuantity: number;
        availableQuantity: number;
      }>;
      unavailableProductIds?: string[];
      unavailableProducts?: Array<{
        id: string;
        name: string | null;
        reason: "MISSING" | "SOLD_OUT";
      }>;
      missingProductIds?: string[];
      soldOutProductIds?: string[];
    };

    if (Array.isArray(errorPayload.unavailableItems) && errorPayload.unavailableItems.length > 0) {
      const unavailableList = errorPayload.unavailableItems
        .map((item) => {
          const productName = item.productName?.trim() || item.productId;
          const colorName = item.colorName?.trim() || item.productColorId;
          const reasonLabel = item.reason
            .toLowerCase()
            .replace(/_/g, " ");
          return `${productName} - ${colorName} (${reasonLabel})`;
        })
        .join(", ");

      throw new Error(`${errorPayload.message ?? "One or more items are unavailable"}: ${unavailableList}`);
    }

    if (Array.isArray(errorPayload.unavailableProducts) && errorPayload.unavailableProducts.length > 0) {
      const unavailableList = errorPayload.unavailableProducts
        .map((item) => {
          const title = item.name?.trim() || item.id;
          const reasonLabel = item.reason === "SOLD_OUT" ? "sold out" : "missing";
          return `${title} (${reasonLabel})`;
        })
        .join(", ");

      throw new Error(`${errorPayload.message ?? "One or more products are unavailable"}: ${unavailableList}`);
    }

    if (Array.isArray(errorPayload.unavailableProductIds) && errorPayload.unavailableProductIds.length > 0) {
      const unavailableList = errorPayload.unavailableProductIds.join(", ");
      throw new Error(`${errorPayload.message ?? "One or more products are unavailable"}: ${unavailableList}`);
    }

    throw new Error(errorPayload.message ?? "Unable to create payment order");
  }

  return response.json();
}

export async function listUserAddresses() {
  const response = await fetch("/api/me/addresses", {
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    addresses?: UserAddress[];
  };

  if (!response.ok) {
    throw new Error(payload.message ?? "Unable to load addresses");
  }

  return payload.addresses ?? [];
}

export async function createUserAddress(input: AddressInput) {
  const response = await fetch("/api/me/addresses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    address?: UserAddress;
  };

  if (!response.ok) {
    throw new Error(payload.message ?? "Unable to create address");
  }

  if (!payload.address) {
    throw new Error("Address creation response was incomplete");
  }

  return payload.address;
}

export async function updateUserAddress(addressId: string, input: AddressInput) {
  const response = await fetch(`/api/me/addresses/${encodeURIComponent(addressId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    address?: UserAddress;
  };

  if (!response.ok) {
    throw new Error(payload.message ?? "Unable to update address");
  }

  if (!payload.address) {
    throw new Error("Address update response was incomplete");
  }

  return payload.address;
}

export async function setDefaultUserAddress(addressId: string) {
  const response = await fetch(`/api/me/addresses/${encodeURIComponent(addressId)}/default`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" }
  });

  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    addresses?: UserAddress[];
  };

  if (!response.ok) {
    throw new Error(payload.message ?? "Unable to set default address");
  }

  return payload.addresses ?? [];
}

export async function deleteUserAddress(addressId: string) {
  const response = await fetch(`/api/me/addresses/${encodeURIComponent(addressId)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" }
  });

  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    addresses?: UserAddress[];
  };

  if (!response.ok) {
    throw new Error(payload.message ?? "Unable to delete address");
  }

  return payload.addresses ?? [];
}

export async function listUserOrders() {
  const response = await fetch("/api/me/orders", {
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    orders?: UserOrder[];
  };

  if (!response.ok) {
    throw new Error(payload.message ?? "Unable to load orders");
  }

  return payload.orders ?? [];
}

export async function verifyRazorpayPayment(payload: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<{ verified: boolean; orderId: string; alreadyPaid: boolean }> {
  const apiUrl = getPublicApiUrl();
  const response = await fetch(`${apiUrl}/api/payments/razorpay/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? "Payment verification failed");
  }

  return response.json();
}

export async function releaseStockReservation(payload: {
  razorpayOrderId?: string;
  customerUserId?: string;
}): Promise<void> {
  const apiUrl = getPublicApiUrl();
  await fetch(`${apiUrl}/api/payments/razorpay/release`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  // Fire-and-forget — failure here is non-fatal (reservations expire anyway)
}
