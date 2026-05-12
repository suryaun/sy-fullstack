import type { Metadata } from "next";
import AuthProvider from "@/components/AuthProvider";
import SiteHeader from "@/components/SiteHeader";
import StoreProvider from "@/components/StoreProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seere Yaana",
  description: "Minimalist luxury ethnic boutique",
  icons: {
    icon: "/seere-yaana-logo.png",
    apple: "/seere-yaana-logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
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
