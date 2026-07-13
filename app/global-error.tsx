"use client";

import { useEffect } from "react";

// Root-level fallback — catches errors thrown by the root layout itself.
// It renders OUTSIDE the root layout, so the theme provider, the pre-paint
// data-theme bootstrap script, and src/index.css tokens are ALL unavailable
// here. Everything is therefore inlined. The app's real theme is Redux-driven
// and unreachable from this boundary, so dark mode falls back to the OS
// preference via prefers-color-scheme. Palette hexes mirror src/index.css.

// Single source so swapping in a dark-mode variant or an SVG later is one line.
const LOGO_SRC = "/app-logo.png";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <style>{`
          .ge-root{
            /* Light tokens — mirror :root in src/index.css */
            --bg:#f5f3ef; --surface:#ffffff; --elevated:#faf9f7; --border:#e8e4dd;
            --text:#302d29; --secondary:#6b655c; --muted:#6b6258;
            --brand:#10b981; --brand-hover:#0e9d6e;
            --danger:#b91c1c; --danger-bg:#fef2f2;
            min-height:100vh; display:flex; align-items:center; justify-content:center;
            padding:16px; background:var(--bg); color:var(--text);
            font-family:Inter,system-ui,-apple-system,sans-serif;
            -webkit-font-smoothing:antialiased;
          }
          /* No Redux/localStorage here — respect the OS preference instead. */
          @media (prefers-color-scheme: dark){
            .ge-root{
              /* Dark tokens — mirror [data-theme="dark"] in src/index.css */
              --bg:#0e0e11; --surface:#17171a; --elevated:#1f1f23; --border:#2a2a30;
              --text:#f4ede6; --secondary:#d5bfb2; --muted:#ab9d8d;
              --brand:#10b981; --brand-hover:#0e9d6e;
              --danger:#ef4444; --danger-bg:rgba(239,68,68,0.15);
            }
          }
          .ge-card{
            width:100%; max-width:440px; text-align:center; padding:40px 32px;
            background:var(--surface); border:1px solid var(--border);
            border-radius:16px; box-shadow:0 10px 15px -3px rgba(0,0,0,.08);
          }
          /* Subtle plate keeps the flat logo legible on both surfaces. */
          .ge-plate{
            display:inline-flex; padding:10px 18px; margin-bottom:24px;
            border-radius:12px; background:var(--elevated); border:1px solid var(--border);
          }
          .ge-logo{ height:auto; width:180px; display:block; }
          .ge-badge{
            width:48px; height:48px; margin:0 auto 16px; border-radius:16px;
            display:flex; align-items:center; justify-content:center; background:var(--danger-bg);
          }
          .ge-h1{ font-size:20px; font-weight:700; margin:0 0 8px; color:var(--text); }
          .ge-p{ font-size:14px; line-height:1.5; margin:0 0 24px; color:var(--secondary); }
          .ge-btn{
            display:inline-flex; align-items:center; gap:8px; justify-content:center;
            padding:10px 20px; font-size:14px; font-weight:600; font-family:inherit;
            border:none; border-radius:8px; background:var(--brand); color:#fff; cursor:pointer;
          }
          .ge-btn:hover{ background:var(--brand-hover); }
          .ge-ref{ font-size:12px; margin:24px 0 0; color:var(--muted); }
          .ge-ref code{ font-family:"IBM Plex Mono",ui-monospace,monospace; }
        `}</style>
        <div className="ge-root">
          <div className="ge-card">
            <span className="ge-plate">
              {/* Plain <img>: next/image + theme system are out of reach here.
                  eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={LOGO_SRC}
                alt="Pharma Glimmora"
                width={180}
                height={47}
                className="ge-logo"
              />
            </span>

            <div className="ge-badge" aria-hidden="true">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--danger)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
            </div>

            <h1 className="ge-h1">Something went wrong</h1>
            <p className="ge-p">
              A critical error prevented the application from loading. Please try
              again. If the problem persists, contact support with the reference
              below.
            </p>

            <button type="button" className="ge-btn" onClick={() => reset()}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Try again
            </button>

            {error?.digest && (
              <p className="ge-ref">
                Reference: <code>{error.digest}</code>
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
