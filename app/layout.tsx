import type { Metadata } from "next";
import { Providers } from "@/components/Providers";
import { SEO } from "@/constants/seo";
import "@/index.css";

export const metadata: Metadata = {
  title: {
    default: SEO.defaultTitle,
    template: `%s \u2014 ${SEO.siteName}`,
  },
  description: SEO.defaultDescription,
  keywords: SEO.defaultKeywords,
  authors: [{ name: "Glimmora International" }],
  robots: { index: false, follow: false }, // Private pharma app — no indexing
  metadataBase: new URL(SEO.siteUrl),
  openGraph: {
    type: "website",
    siteName: SEO.siteName,
    title: SEO.defaultTitle,
    description: SEO.defaultDescription,
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    site: SEO.twitterHandle,
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  other: {
    "theme-color": "#0F6E56",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
