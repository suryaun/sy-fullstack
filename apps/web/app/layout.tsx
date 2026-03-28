import type { Metadata } from "next";
import Script from "next/script";
import AuthProvider from "@/components/AuthProvider";
import SiteHeader from "@/components/SiteHeader";
import StoreProvider from "@/components/StoreProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seere Yaana",
  description: "Minimalist luxury ethnic boutique",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="lazyOnload"
        />
        <AuthProvider>
          <StoreProvider>
            <SiteHeader />
            {children}
          </StoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
