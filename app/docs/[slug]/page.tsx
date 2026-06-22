import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSopDoc, allSopSlugs } from "@/lib/sopDocs";

// The GxP Help Assistant cites SOPs with deep links like `/docs/sop-capa-002`.
// This route renders those documents so the citation opens the source instead
// of a 404. Public (no auth) — the demo corpus is shared reference material,
// and the links are opened in a new tab.

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** Prebuild the known SOP routes; unknown slugs fall through to notFound(). */
export function generateStaticParams() {
  return allSopSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = getSopDoc(slug);
  if (!doc) return { title: "Document not found" };
  return { title: `${doc.id} — ${doc.title}` };
}

export default async function SopDocPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = getSopDoc(slug);
  if (!doc) notFound();

  return (
    <main
      style={{ background: "var(--bg-base)", minHeight: "100vh", color: "var(--text-primary)" }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px 64px" }}>
        <Link
          href="/"
          style={{ fontSize: 13, color: "var(--brand)", textDecoration: "none" }}
        >
          ← Back to Pharma Glimmora
        </Link>

        <article
          style={{
            marginTop: 20,
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: 12,
            padding: "28px 28px 32px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.02em",
                color: "var(--brand)",
                background: "var(--brand-muted)",
                border: "1px solid var(--brand-border)",
                borderRadius: 6,
                padding: "2px 8px",
              }}
            >
              {doc.id}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{doc.section}</span>
          </div>

          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "14px 0 4px" }}>{doc.title}</h1>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 20px" }}>
            Controlled document · Demo SOP corpus
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {doc.body.map((para, i) => (
              <p
                key={i}
                style={{ fontSize: 14, lineHeight: 1.65, color: "var(--text-primary)", margin: 0 }}
              >
                {para}
              </p>
            ))}
          </div>
        </article>

        <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 16 }}>
          This is reference content cited by the AI Compliance Assistant. It is read-only and not a
          substitute for your site&rsquo;s approved, version-controlled SOP.
        </p>
      </div>
    </main>
  );
}
