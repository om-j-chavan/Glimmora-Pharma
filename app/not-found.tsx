import Image from "next/image";
import Link from "next/link";
import { Home } from "lucide-react";

// Brand mark — single source so swapping in a dark-mode variant or an SVG later
// is a one-line change. Rendered on a subtle surface plate (below) so the flat
// PNG stays legible on both the light (cream) and dark (charcoal) backgrounds.
const LOGO_SRC = "/logo.png";

export const metadata = {
  title: "Page not found",
};

// Root 404 — Server Component. Renders inside the root layout, so the theme
// tokens (var(--…)) and global component classes (.btn-primary) are available.
export default function NotFound() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "var(--bg-base)" }}
    >
      <div
        className="w-full max-w-[440px] rounded-2xl px-8 py-10 text-center"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--bg-border)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {/* Logo plate — subtle inset chip keeps the wordmark legible in both themes */}
        <div className="flex justify-center mb-8">
          <span
            className="inline-flex rounded-xl px-5 py-3"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--bg-border)",
            }}
          >
            <Image
              src={LOGO_SRC}
              alt="Pharma Glimmora"
              width={200}
              height={52}
              priority
              className="h-auto w-[200px]"
            />
          </span>
        </div>

        <div
          className="text-[13px] font-semibold tracking-[0.18em] mb-2"
          style={{ color: "var(--brand)" }}
        >
          404
        </div>
        <h1
          className="text-[22px] font-bold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Page not found
        </h1>
        <p
          className="text-[14px] mb-7"
          style={{ color: "var(--text-secondary)" }}
        >
          The page you&rsquo;re looking for doesn&rsquo;t exist or may have been
          moved. Check the address, or head back to your dashboard.
        </p>

        <Link href="/" className="btn-primary w-full justify-center">
          <Home className="w-4 h-4" aria-hidden="true" />
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
