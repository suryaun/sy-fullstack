import { getPublicApiUrl } from "@/lib/publicApiUrl";

export async function createRazorpayOrder(payload: {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: Array<{ productId: string; quantity: number }>;
}) {
  const apiUrl = getPublicApiUrl();
  const response = await fetch(`${apiUrl}/api/payments/razorpay/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("Unable to create payment order");
  }

  return response.json();
}

export async function verifyRazorpayPayment(payload: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}) {
  const apiUrl = getPublicApiUrl();
  const response = await fetch(`${apiUrl}/api/payments/razorpay/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("Payment verification failed");
  }

  return response.json();
}
