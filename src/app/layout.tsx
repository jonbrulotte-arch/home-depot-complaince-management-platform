import type { Metadata } from "next";
import { connection } from "next/server";
import { getBranding } from "@/lib/branding";
import { Geist } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const branding = await getBranding();
  return {
    title: branding.siteName,
    description: "THD Compliance Management Platform",
    ...(branding.logoUrl ? { icons: { icon: branding.logoUrl } } : {}),
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="h-full font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
