import Link from "next/link";
import { SearchX, Home } from "lucide-react";

/**
 * Not-found boundary for EVERY customer route in the (app) group.
 *
 * Why this file has to exist: `notFound()` is thrown from the record-detail
 * routes as the deliberate response to "this id does not exist, OR you may not
 * see it" — /governance/risks/[id], /governance/decisions/[id], /capa/[id], …
 * (the IDOR guard in src/lib/queries/risks.ts depends on the two being
 * indistinguishable). A thrown notFound() is caught by the NEAREST
 * `not-found.tsx` boundary. Until this file existed the nearest one was the
 * ROOT app/not-found.tsx, which sits OUTSIDE this group's layout — Next cannot
 * compose it into the already-rendered AppShell, so the throw resolved to a
 * blank body served with HTTP 200. A missing record looked like a broken page,
 * and crawlers/monitoring saw a success.
 *
 * Being a boundary INSIDE the group, it renders in the normal content area
 * (sidebar + header intact) and lets Next set the 404 status correctly.
 *
 * Server Component on purpose — no interactivity is needed, and keeping it out
 * of the client bundle means the status can be committed before any streaming.
 *
 * NOTE: this does NOT shadow the root 404. A URL that matches no route at all
 * never resolves into this group, so app/not-found.tsx still owns those.
 */
export default function AppNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}
      >
        <SearchX className="w-7 h-7" style={{ color: "var(--text-secondary)" }} aria-hidden="true" />
      </div>

      <div className="text-[12px] font-semibold tracking-[0.18em] mb-1" style={{ color: "var(--brand)" }}>
        404
      </div>
      <h2 className="text-[16px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        Record not found
      </h2>
      <p className="text-[13px] mb-4 max-w-[420px]" style={{ color: "var(--text-secondary)" }}>
        This record doesn&rsquo;t exist, has been archived, or isn&rsquo;t visible to your
        role. Check the link, or go back and pick it from the list.
      </p>

      <Link href="/" className="btn-primary justify-center">
        <Home className="w-4 h-4" aria-hidden="true" />
        Back to dashboard
      </Link>
    </div>
  );
}
