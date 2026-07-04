import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

const DELHIVERY_STAGING_BASE_URL = "https://staging-express.delhivery.com";
const DELHIVERY_PRODUCTION_BASE_URL = "https://track.delhivery.com";

type CourierProviderCode = "DELHIVERY";

type ServiceabilityResult = {
  enabled: boolean;
  provider: CourierProviderCode | null;
  postalCode: string;
  serviceable: boolean;
  message: string;
  reason: string | null;
  prepaidAvailable: boolean | null;
  codAvailable: boolean | null;
  pickupAvailable: boolean | null;
  estimatedDays: number | null;
  city: string | null;
  state: string | null;
  raw: unknown;
};

const INDIAN_STATE_CODES: Record<string, string> = {
  AN: "Andaman and Nicobar Islands", AP: "Andhra Pradesh", AR: "Arunachal Pradesh",
  AS: "Assam", BR: "Bihar", CG: "Chhattisgarh", CH: "Chandigarh",
  DD: "Daman and Diu", DL: "Delhi", DN: "Dadra and Nagar Haveli",
  GA: "Goa", GJ: "Gujarat", HP: "Himachal Pradesh", HR: "Haryana",
  JH: "Jharkhand", JK: "Jammu and Kashmir", KA: "Karnataka", KL: "Kerala",
  LA: "Ladakh", LD: "Lakshadweep", MH: "Maharashtra", ML: "Meghalaya",
  MN: "Manipur", MP: "Madhya Pradesh", MZ: "Mizoram", NL: "Nagaland",
  OD: "Odisha", OR: "Odisha", PB: "Punjab", PY: "Puducherry",
  RJ: "Rajasthan", SK: "Sikkim", TN: "Tamil Nadu", TS: "Telangana",
  TR: "Tripura", UK: "Uttarakhand", UP: "Uttar Pradesh", WB: "West Bengal",
};

type ShipmentAddress = {
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
};

type ShipmentItem = {
  name: string;
  quantity: number;
  packageLengthCm: number;
  packageWidthCm: number;
  packageHeightCm: number;
  weightGrams: number;
  sourcePincode: string;
};

type ShipmentRequest = {
  orderId: string;
  reference: string;
  amountInPaise: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  address: ShipmentAddress;
  items: ShipmentItem[];
};

type ShipmentBookingResult = {
  provider: CourierProviderCode;
  status: "BOOKED" | "FAILED";
  providerShipmentId: string | null;
  providerWaybill: string | null;
  providerReference: string;
  message: string;
  requestPayload: unknown;
  responsePayload: unknown;
};

interface CourierProvider {
  readonly code: CourierProviderCode;
  checkPostalCodeServiceability(postalCode: string): Promise<ServiceabilityResult>;
  createShipment(input: ShipmentRequest): Promise<ShipmentBookingResult>;
  buildTrackingUrl(trackingNumber: string | null): string | null;
}

function asTrimmedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizePostalCode(postalCode: string) {
  return postalCode.replace(/\D/g, "").trim();
}

function getConfiguredCourierProviderCode(): CourierProviderCode | null {
  const value = asTrimmedText(process.env.COURIER_PROVIDER).toUpperCase();
  if (!value) {
    return null;
  }

  if (value === "DELHIVERY") {
    return "DELHIVERY";
  }

  throw new Error(`Unsupported courier provider: ${value}`);
}

function getDelhiveryBaseUrl() {
  const configured = asTrimmedText(process.env.DELHIVERY_API_BASE_URL);
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const useStaging = asTrimmedText(process.env.DELHIVERY_USE_STAGING).toLowerCase();
  return useStaging === "false"
    ? DELHIVERY_PRODUCTION_BASE_URL
    : DELHIVERY_STAGING_BASE_URL;
}

function getDelhiveryToken() {
  const token = asTrimmedText(process.env.DELHIVERY_API_TOKEN);
  if (!token) {
    throw new Error("DELHIVERY_API_TOKEN is not configured");
  }

  return token;
}

function getDelhiveryPickupLocationName() {
  const pickupLocationName = asTrimmedText(process.env.DELHIVERY_PICKUP_LOCATION_NAME);
  if (!pickupLocationName) {
    throw new Error("DELHIVERY_PICKUP_LOCATION_NAME is not configured");
  }

  return pickupLocationName;
}

function getDelhiveryOriginPincode() {
  return asTrimmedText(process.env.DELHIVERY_ORIGIN_PINCODE) || "560064";
}

function getBusinessName() {
  return asTrimmedText(process.env.BUSINESS_NAME) || "Seere Yaana";
}

function parseJsonResponse(text: string) {
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

const FETCH_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [2_000, 5_000];

function isTransientError(error: unknown): boolean {
  if (error instanceof TypeError) return true; // network errors
  if (error instanceof DOMException && error.name === "AbortError") return false; // timeout — don't retry
  const msg = error instanceof Error ? error.message : "";
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|fetch failed/i.test(msg);
}

async function fetchWithRetry(
  url: string | URL,
  options: RequestInit,
  label: string,
): Promise<{ response: Response; responseText: string }> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const responseText = await response.text();

      // Don't retry 4xx - bad data or auth issues
      if (response.status >= 400 && response.status < 500) {
        return { response, responseText };
      }

      // Retry 5xx
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        console.warn(`[courier] ${label} returned ${response.status}, retrying (${attempt + 1}/${MAX_RETRIES})...`);
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt] ?? 5_000));
        continue;
      }

      return { response, responseText };
    } catch (error) {
      lastError = error;

      if (attempt < MAX_RETRIES && isTransientError(error)) {
        console.warn(`[courier] ${label} network error, retrying (${attempt + 1}/${MAX_RETRIES}):`, error instanceof Error ? error.message : error);
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt] ?? 5_000));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

function findNestedString(value: unknown, keys: string[]): string | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

class DelhiveryCourierProvider implements CourierProvider {
  readonly code = "DELHIVERY" as const;

  private readonly baseUrl = getDelhiveryBaseUrl();
  private readonly token = getDelhiveryToken();
  private readonly pickupLocationName = getDelhiveryPickupLocationName();

  constructor() {
    console.log(
      "[courier] Delhivery provider initialized - baseUrl:",
      this.baseUrl,
      "token length:",
      this.token.length,
      "token preview:",
      this.token.substring(0, 10) + "...",
      "pickup location:",
      this.pickupLocationName
    );
  }

  private buildHeaders(contentType?: string) {
    const headers = new Headers({
      Authorization: `Token ${this.token}`,
      Accept: "application/json",
    });

    if (contentType) {
      headers.set("Content-Type", contentType);
    }

    return headers;
  }

  private async fetchExpectedTat(destinationPincode: string): Promise<number | null> {
    const originPincode = getDelhiveryOriginPincode();
    const url = new URL(`${this.baseUrl}/api/dc/expected_tat`);
    url.searchParams.set("origin_pin", originPincode);
    url.searchParams.set("destination_pin", destinationPincode);
    url.searchParams.set("mot", "S");

    const { response, responseText } = await fetchWithRetry(url, {
      method: "GET",
      headers: this.buildHeaders(),
    }, "expectedTat");

    if (!response.ok) {
      return null;
    }

    const payload = parseJsonResponse(responseText);
    const record = asRecord(payload);
    if (!record?.success) {
      return null;
    }

    const data = asRecord(record.data);
    const tat = Number(data?.tat);
    return Number.isFinite(tat) && tat > 0 ? tat : null;
  }

  async checkPostalCodeServiceability(postalCode: string): Promise<ServiceabilityResult> {
    const normalizedPostalCode = normalizePostalCode(postalCode);
    if (normalizedPostalCode.length < 6) {
      return {
        enabled: true,
        provider: this.code,
        postalCode: normalizedPostalCode,
        serviceable: false,
        message: "Enter a valid 6-digit postal code.",
        reason: "INVALID_POSTAL_CODE",
        prepaidAvailable: null,
        codAvailable: null,
        pickupAvailable: null,
        estimatedDays: null,
        city: null,
        state: null,
        raw: null,
      };
    }

    const url = new URL(`${this.baseUrl}/c/api/pin-codes/json/`);
    url.searchParams.set("filter_codes", normalizedPostalCode);

    console.log("[courier] Making serviceability request to:", url.toString(), "with auth header: Token " + this.token.substring(0, 10) + "...");

    const { response, responseText } = await fetchWithRetry(url, {
      method: "GET",
      headers: this.buildHeaders(),
    }, "serviceability");
    const payload = parseJsonResponse(responseText);

    if (!response.ok) {
      console.error("[courier] Delhivery API error status:", response.status, "response:", responseText.substring(0, 200));
      throw new Error(`Delhivery serviceability request failed with status ${response.status}`);
    }

    const root = asRecord(payload);
    const deliveryCodes = Array.isArray(root?.delivery_codes)
      ? root.delivery_codes
      : [];
    const firstEntry = deliveryCodes[0];
    const postalCodeData = asRecord(asRecord(firstEntry)?.postal_code ?? firstEntry);

    if (!postalCodeData) {
      return {
        enabled: true,
        provider: this.code,
        postalCode: normalizedPostalCode,
        serviceable: false,
        message: "This postal code is not serviceable yet.",
        reason: "NON_SERVICEABLE",
        prepaidAvailable: false,
        codAvailable: false,
        pickupAvailable: false,
        estimatedDays: null,
        city: null,
        state: null,
        raw: payload,
      };
    }

    const remarks = asTrimmedText(postalCodeData.remarks);
    const prepaidAvailable = asTrimmedText(postalCodeData.pre_paid).toUpperCase() === "Y";
    const codAvailable = [postalCodeData.cod, postalCodeData.cash]
      .some((value) => asTrimmedText(value).toUpperCase() === "Y");
    const pickupAvailable = asTrimmedText(postalCodeData.pickup).toUpperCase() === "Y";
    const embargoed = remarks.toLowerCase() === "embargo";
    const serviceable = prepaidAvailable && !embargoed;

    let estimatedDays: number | null = null;
    if (serviceable) {
      try {
        estimatedDays = await this.fetchExpectedTat(normalizedPostalCode);
      } catch (error) {
        console.warn("[courier] TAT lookup failed, continuing without estimate:", error instanceof Error ? error.message : error);
      }
    }

    const stateCode = asTrimmedText(postalCodeData.state_code).toUpperCase();
    const city = asTrimmedText(postalCodeData.district) || asTrimmedText(postalCodeData.city) || null;
    const state = INDIAN_STATE_CODES[stateCode] ?? (stateCode || null);

    return {
      enabled: true,
      provider: this.code,
      postalCode: normalizedPostalCode,
      serviceable,
      message: serviceable
        ? "Delivery is available for this postal code."
        : remarks
          ? `Delivery is unavailable: ${remarks}.`
          : prepaidAvailable
            ? "Delivery is currently unavailable for this postal code."
            : "Prepaid delivery is not available for this postal code.",
      reason: serviceable
        ? null
        : remarks
          ? remarks.toUpperCase().replace(/\s+/g, "_")
          : "NON_SERVICEABLE",
      prepaidAvailable,
      codAvailable,
      pickupAvailable,
      estimatedDays,
      city,
      state,
      raw: payload,
    };
  }

  async createShipment(input: ShipmentRequest): Promise<ShipmentBookingResult> {
    const addressLine = [input.address.line1, input.address.line2, input.address.landmark]
      .map((value) => asTrimmedText(value))
      .filter(Boolean)
      .join(", ");
    const totalQuantity = input.items.reduce((sum, item) => sum + item.quantity, 0);
    const productsDescription = input.items
      .map((item) => `${item.name} x ${item.quantity}`)
      .join(", ");

    // Aggregate delivery details from order items
    const totalWeightGrams = input.items.reduce((sum, item) => sum + item.weightGrams * item.quantity, 0);
    const maxLength = Math.max(...input.items.map((item) => item.packageLengthCm));
    const maxWidth = Math.max(...input.items.map((item) => item.packageWidthCm));
    const totalHeight = input.items.reduce((sum, item) => sum + item.packageHeightCm * item.quantity, 0);

    const shipmentPayload = {
      shipments: [
        {
          name: input.address.fullName || input.customerName,
          order: input.reference,
          phone: input.address.phoneNumber || input.customerPhone,
          email: input.customerEmail,
          add: addressLine,
          pin: normalizePostalCode(input.address.postalCode),
          city: input.address.city,
          state: input.address.state,
          country: input.address.country || "India",
          address_type: input.address.addressType || "home",
          payment_mode: "Prepaid",
          total_amount: Number((input.amountInPaise / 100).toFixed(2)),
          quantity: totalQuantity,
          weight: totalWeightGrams / 1000,
          shipment_length: maxLength,
          shipment_width: maxWidth,
          shipment_height: totalHeight,
          products_desc: productsDescription,
          seller_name: getBusinessName(),
        },
      ],
      pickup_location: {
        name: this.pickupLocationName,
      },
    };

    const body = new URLSearchParams({
      format: "json",
      data: JSON.stringify(shipmentPayload),
    }).toString();

    const { response, responseText } = await fetchWithRetry(`${this.baseUrl}/api/cmu/create.json`, {
      method: "POST",
      headers: this.buildHeaders("application/x-www-form-urlencoded"),
      body,
    }, "createShipment");

    const payload = parseJsonResponse(responseText);
    const payloadRecord = asRecord(payload);
    const packages = Array.isArray(payloadRecord?.packages) ? payloadRecord.packages : [];
    const firstPackage = asRecord(packages[0]);
    const firstShipment = Array.isArray(payloadRecord?.shipment)
      ? asRecord(payloadRecord.shipment[0])
      : asRecord(payloadRecord?.shipment);

    const providerWaybill =
      findNestedString(firstPackage, ["waybill", "awb"])
      ?? findNestedString(firstShipment, ["waybill", "awb"])
      ?? findNestedString(payloadRecord, ["waybill", "awb"]);
    const providerShipmentId =
      findNestedString(firstPackage, ["refnum", "shipment_id", "order"])
      ?? findNestedString(firstShipment, ["refnum", "shipment_id", "order"])
      ?? input.reference;
    const remark = findNestedString(payloadRecord, ["rmk", "remarks", "message", "detail"]);
    const packageStatus = asTrimmedText(firstPackage?.status).toLowerCase();
    const packageRemarks = Array.isArray(firstPackage?.remarks)
      ? (firstPackage.remarks as string[]).filter((r) => typeof r === "string" && r.trim()).join("; ")
      : "";
    const inferredFailure =
      !response.ok ||
      payloadRecord?.success === false ||
      packageStatus === "fail" ||
      (remark
        ? /(duplicate|missing|not active|unable|error|invalid|non-serviceable|embargo|does not exist|suspicious)/i.test(remark)
        : false);
    const failureDetail = packageRemarks || remark || "";

    return {
      provider: this.code,
      status: inferredFailure ? "FAILED" : "BOOKED",
      providerShipmentId,
      providerWaybill,
      providerReference: input.reference,
      message: failureDetail || (inferredFailure ? "Unable to book Delhivery shipment." : "Shipment booked."),
      requestPayload: shipmentPayload,
      responsePayload: payload,
    };
  }

  buildTrackingUrl(trackingNumber: string | null) {
    const normalizedTrackingNumber = asTrimmedText(trackingNumber);
    if (!normalizedTrackingNumber) {
      return null;
    }

    const baseTrackingUrl = asTrimmedText(process.env.DELHIVERY_TRACKING_BASE_URL);
    if (!baseTrackingUrl) {
      return null;
    }

    return `${baseTrackingUrl.replace(/\/+$/, "")}/${encodeURIComponent(normalizedTrackingNumber)}`;
  }
}

function getActiveCourierProvider(): CourierProvider | null {
  const providerCode = getConfiguredCourierProviderCode();
  if (!providerCode) {
    return null;
  }

  if (providerCode === "DELHIVERY") {
    return new DelhiveryCourierProvider();
  }

  return null;
}

export async function checkDeliveryPostalCodeServiceability(postalCode: string): Promise<ServiceabilityResult> {
  const normalizedPostalCode = normalizePostalCode(postalCode);
  const provider = getActiveCourierProvider();
  if (!provider) {
    return {
      enabled: false,
      provider: null,
      postalCode: normalizedPostalCode,
      serviceable: true,
      message: "Courier serviceability checks are not configured.",
      reason: null,
      prepaidAvailable: null,
      codAvailable: null,
      pickupAvailable: null,
      estimatedDays: null,
      city: null,
      state: null,
      raw: null,
    };
  }

  return provider.checkPostalCodeServiceability(normalizedPostalCode);
}

export async function assertDeliveryPostalCodeServiceable(postalCode: string) {
  const result = await checkDeliveryPostalCodeServiceability(postalCode);
  if (!result.enabled) {
    return result;
  }

  if (!result.serviceable) {
    throw new Error(result.message || "This postal code is not serviceable.");
  }

  return result;
}

export async function createShipmentForPaidOrder(orderId: string) {
  const provider = getActiveCourierProvider();
  if (!provider) {
    return null;
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              packageLengthCm: true,
              packageWidthCm: true,
              packageHeightCm: true,
              weightGrams: true,
              sourcePincode: true,
            },
          },
        },
      },
      shipments: {
        where: { provider: provider.code },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!order || order.status !== "PAID") {
    return null;
  }

  const address = asRecord(order.deliveryAddressSnapshot);
  const normalizedAddress: ShipmentAddress | null = address
    ? {
        fullName: asTrimmedText(address.fullName) || order.customerName,
        phoneNumber: asTrimmedText(address.phoneNumber) || order.customerPhone,
        line1: asTrimmedText(address.line1),
        line2: asTrimmedText(address.line2) || null,
        landmark: asTrimmedText(address.landmark) || null,
        city: asTrimmedText(address.city),
        state: asTrimmedText(address.state),
        postalCode: asTrimmedText(address.postalCode),
        country: asTrimmedText(address.country) || "India",
        addressType: asTrimmedText(address.addressType) || null,
      }
    : null;

  if (!normalizedAddress || !normalizedAddress.line1 || !normalizedAddress.city || !normalizedAddress.state || !normalizedAddress.postalCode) {
    const failureMessage = "Delivery address snapshot is incomplete for shipment booking.";
    const shipment = await prisma.orderShipment.create({
      data: {
        orderId: order.id,
        provider: provider.code,
        status: "FAILED",
        providerReference: order.invoiceNumber ?? order.id,
        serviceablePostalCode: false,
        failureMessage,
      },
    });
    return [shipment];
  }

  let serviceability: ServiceabilityResult;
  try {
    serviceability = await provider.checkPostalCodeServiceability(normalizedAddress.postalCode);
  } catch (error) {
    const failureMessage = error instanceof Error
      ? error.message
      : "Courier serviceability check failed.";
    const shipment = await prisma.orderShipment.create({
      data: {
        orderId: order.id,
        provider: provider.code,
        status: "FAILED",
        providerReference: order.invoiceNumber ?? order.id,
        serviceablePostalCode: false,
        failureMessage,
      },
    });
    return [shipment];
  }

  if (!serviceability.serviceable) {
    const shipment = await prisma.orderShipment.create({
      data: {
        orderId: order.id,
        provider: provider.code,
        status: "FAILED",
        providerReference: order.invoiceNumber ?? order.id,
        serviceablePostalCode: false,
        requestPayload: { postalCode: normalizedAddress.postalCode },
        responsePayload: (serviceability.raw ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        failureMessage: serviceability.message,
      },
    });
    return [shipment];
  }

  // Group items by source pincode -> one shipment per pack
  const itemsBySourcePin = new Map<string, typeof order.items>();
  for (const item of order.items) {
    const pin = item.product.sourcePincode;
    const group = itemsBySourcePin.get(pin);
    if (group) {
      group.push(item);
    } else {
      itemsBySourcePin.set(pin, [item]);
    }
  }

  const packs = [...itemsBySourcePin.entries()];
  const baseReference = order.invoiceNumber ?? order.id;
  const results = [];

  // Build a map of existing shipments by sourcePincode for idempotency
  const existingByPin = new Map<string, typeof order.shipments[0]>();
  for (const s of order.shipments) {
    if (s.sourcePincode && !existingByPin.has(s.sourcePincode)) {
      existingByPin.set(s.sourcePincode, s);
    }
  }
  // Legacy: if there's a single existing shipment with no sourcePincode and only one pack, match it
  if (packs.length === 1 && !existingByPin.has(packs[0][0])) {
    const legacy = order.shipments.find((s) => !s.sourcePincode);
    if (legacy) {
      existingByPin.set(packs[0][0], legacy);
    }
  }

  for (let i = 0; i < packs.length; i++) {
    const [sourcePincode, packItems] = packs[i];
    const existing = existingByPin.get(sourcePincode);

    // Skip packs that are already booked
    if (existing?.status === "BOOKED") {
      results.push(existing);
      continue;
    }

    const packReference = packs.length === 1
      ? baseReference
      : `${baseReference}-P${i + 1}`;

    // Split the total order amount proportionally by item value
    const totalOrderValue = order.items.reduce((s, it) => s + it.priceAtTime * it.quantity, 0);
    const packValue = packItems.reduce((s, it) => s + it.priceAtTime * it.quantity, 0);
    const packAmountInPaise = totalOrderValue > 0
      ? Math.round((packValue / totalOrderValue) * order.amountInPaise)
      : order.amountInPaise;

    const booking = await provider.createShipment({
      orderId: order.id,
      reference: packReference,
      amountInPaise: packAmountInPaise,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      address: normalizedAddress,
      items: packItems.map((item) => ({
        name: item.product.name,
        quantity: item.quantity,
        packageLengthCm: item.product.packageLengthCm,
        packageWidthCm: item.product.packageWidthCm,
        packageHeightCm: item.product.packageHeightCm,
        weightGrams: item.product.weightGrams,
        sourcePincode: item.product.sourcePincode,
      })),
    });

    const data = {
      provider: booking.provider,
      status: booking.status,
      sourcePincode,
      providerShipmentId: booking.providerShipmentId,
      providerWaybill: booking.providerWaybill,
      providerReference: booking.providerReference,
      serviceablePostalCode: true,
      requestPayload: booking.requestPayload as Prisma.InputJsonValue,
      responsePayload: booking.responsePayload as Prisma.InputJsonValue,
      failureMessage: booking.status === "FAILED" ? booking.message : null,
      bookedAt: booking.status === "BOOKED" ? new Date() : null,
    };

    if (existing) {
      const updated = await prisma.orderShipment.update({
        where: { id: existing.id },
        data,
      });
      results.push(updated);
    } else {
      const created = await prisma.orderShipment.create({
        data: { orderId: order.id, ...data },
      });
      results.push(created);
    }
  }

  return results;
}

export function buildShipmentTrackingUrl(input: {
  provider: string;
  trackingNumber: string | null;
}) {
  const normalizedProvider = asTrimmedText(input.provider).toUpperCase();
  if (normalizedProvider === "DELHIVERY") {
    const trackingBaseUrl = asTrimmedText(process.env.DELHIVERY_TRACKING_BASE_URL);
    const trackingNumber = asTrimmedText(input.trackingNumber);
    if (trackingBaseUrl && trackingNumber) {
      return `${trackingBaseUrl.replace(/\/+$/, "")}/${encodeURIComponent(trackingNumber)}`;
    }
  }

  return null;
}
