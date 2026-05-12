import type { ReactNode } from "react";

/**
 * Preloads the Razorpay checkout SDK as soon as the user lands on /checkout,
 * so it's already in the browser cache by the time they click Pay Now.
 */
export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <link
        rel="preload"
        href="https://checkout.razorpay.com/v1/checkout.js"
        as="script"
        crossOrigin="anonymous"
      />
      {children}
    </>
  );
}
