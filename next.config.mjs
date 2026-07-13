/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 16.2 — Browser log forwarding
  logging: {
    browserToTerminal: "error",
  },

  // Image optimization
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60,
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },

  compress: true,

  experimental: {
    // Optimize large package imports (tree-shake)
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "@reduxjs/toolkit",
      "dayjs",
    ],
    // 10 MB ceiling for document uploads (FDA 483 attachments,
    // evidence files, CSV/CSA stage documents). Next.js 16 defaults
    // to 1 MB which silently rejects most real pharma PDFs. Matches
    // the server-side caps in src/actions/evidence.ts and
    // src/actions/systems.ts. Beyond 10 MB, consider direct-to-storage
    // uploads (S3 presigned URLs etc.) — not Server Actions.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },

  // Security + performance headers
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Allow self-origin to use the microphone for the AI voice
          // assistant. Camera + geolocation stay disabled.
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        source: "/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },

  async redirects() {
    return [
      { source: "/api/auth/signin", destination: "/login", permanent: false },
    ];
  },
};

export default nextConfig;
