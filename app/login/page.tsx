import { LoginPage } from "@/components/auth/LoginPage";

// Route-segment config. Forces this page to be rendered at request-time
// instead of statically prerendered at build. Prerendering produced a
// stale RSC variant that the DO CDN cached and served as Content-Type:
// text/x-component for direct browser GETs, surfacing the raw flight
// payload to users (see incident 2026-05-16).
export const dynamic = "force-dynamic";

export default function Page() {
  return <LoginPage />;
}
