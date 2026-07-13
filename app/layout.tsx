import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/Providers";
import { SEO } from "@/constants/seo";
import "@/index.css";

// Self-hosted fonts via next/font (no render-blocking Google-Fonts request).
// The CSS variables intentionally match Tailwind's own theme-token names
// (--font-sans / --font-mono), so the `font-sans`/`font-mono` utilities AND the
// body / .display-id rules in index.css all resolve to Inter / JetBrains Mono.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

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
    images: [{ url: "/app-logo.png", width: 1535, height: 1024 }],
  },
  twitter: {
    card: "summary_large_image",
    site: SEO.twitterHandle,
  },
  // Favicon + apple-touch-icon are served automatically by Next from the
  // app/icon.png and app/apple-icon.png convention files (sourced from
  // app-icon.png) — no manual `icons` entries needed.
  manifest: "/manifest.json",
  other: {
    "theme-color": "#0F6E56",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Pre-paint theme application — eliminates the light-flash (FOUC) a
            dark-mode user otherwise sees before <ThemeSync> runs in an effect.
            Reads the same two keys the theme slice persists (glimmora-theme /
            glimmora-color-theme) and mirrors its "stored value or light"
            default, so this never disagrees with Redux's initial state. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var d=document.documentElement;" +
              "var t=localStorage.getItem('glimmora-theme');" +
              "d.setAttribute('data-theme',t==='dark'?'dark':'light');" +
              "var c=localStorage.getItem('glimmora-color-theme');" +
              "d.setAttribute('data-color-theme',c||'emerald');" +
              "var de=localStorage.getItem('glimmora-density');" +
              "if(de)d.setAttribute('data-density',de);}catch(e){}",
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
