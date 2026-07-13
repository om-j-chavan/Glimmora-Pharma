"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

// Brand mark — single source so swapping in a dark-mode variant or an SVG later
// is a one-line change. Rendered on a subtle surface plate so the flat PNG
// stays legible on both the light (cream) and dark (charcoal) backgrounds.
const LOGO_SRC = "/app-logo.png";

// Root error boundary. Renders inside the root layout, so theme tokens and the
// global component classes (.btn-primary / .btn-secondary) are available.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Send the real error to the console / monitoring — never to the rendered
    // UI in production (Part 11 records and internals must not leak to users).
    console.error(error);
  }, [error]);

  const isDev = process.env.NODE_ENV === "development";

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
        {/* Logo plate */}
        <div className="flex justify-center mb-6">
          <span
            className="inline-flex rounded-xl px-4 py-2.5"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--bg-border)",
            }}
          >
            <Image
              src={LOGO_SRC}
              alt="Pharma Glimmora"
              width={170}
              height={44}
              priority
              className="h-auto w-[170px]"
            />
          </span>
        </div>

        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: "var(--danger-bg)" }}
        >
          <AlertTriangle
            className="w-6 h-6"
            style={{ color: "var(--danger)" }}
            aria-hidden="true"
          />
        </div>

        <h1
          className="text-[20px] font-bold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Something went wrong
        </h1>
        <p
          className="text-[14px] mb-6"
          style={{ color: "var(--text-secondary)" }}
        >
          An unexpected error interrupted this page. You can try again, or return
          to your dashboard. If it keeps happening, contact support with the
          reference below.
        </p>

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button
            type="button"
            onClick={reset}
            className="btn-primary justify-center"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Try again
          </button>
          <Link href="/" className="btn-secondary justify-center">
            <Home className="w-4 h-4" aria-hidden="true" />
            Back to dashboard
          </Link>
        </div>

        {error.digest && (
          <p className="text-[12px] mt-6" style={{ color: "var(--text-muted)" }}>
            Reference: <span className="font-mono">{error.digest}</span>
          </p>
        )}

        {/* Dev-only: raw message for debugging. Never shown in production. */}
        {isDev && error.message && (
          <pre
            className="text-[12px] mt-4 p-3 rounded-lg text-left overflow-auto whitespace-pre-wrap"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--danger)",
              border: "1px solid var(--bg-border)",
            }}
          >
            {error.message}
          </pre>
        )}
      </div>
    </div>
  );
}
