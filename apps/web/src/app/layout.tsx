import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { BrandingProvider } from "@/lib/branding";
export const metadata: Metadata = {
  title: "ISM",
  description: "IS Department Management System",
  icons: { icon: "/icon.png" },
};
const inter = Inter({ subsets: ["latin"], display: "swap" });
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className={inter.className}>
        <BrandingProvider>
          <AuthProvider>{children}</AuthProvider>
        </BrandingProvider>
      </body>
    </html>
  );
}
