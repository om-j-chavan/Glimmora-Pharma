import { redirect } from "next/navigation";

// Stage 2 — the Frameworks page is merged into the region-centric module.
// Frameworks are now managed per-region under /admin/regions (click a region →
// its filtered Frameworks view). This route redirects so old links don't 404.
export default function Page() {
  redirect("/admin/regions");
}
