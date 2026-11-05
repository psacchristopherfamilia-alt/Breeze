import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/components/Providers";
import { SITE_DESCRIPTION, siteUrl } from "@/lib/site";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Breeze", template: "%s · Breeze" },
  description: SITE_DESCRIPTION,
  openGraph: { type: "website", siteName: "Breeze", title: "Breeze", description: SITE_DESCRIPTION },
  twitter: { card: "summary_large_image", title: "Breeze", description: SITE_DESCRIPTION },
  applicationName: "Breeze",
  appleWebApp: { capable: true, title: "Breeze", statusBarStyle: "default" },
  // Breeze ya trae su propio inglés/español: el traductor del navegador cambiaba la marca ("Brisa").
  other: { google: "notranslate" },
};

export const viewport: Viewport = {
  themeColor: "#2bb3b1",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" translate="no" className={`notranslate ${jakarta.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
