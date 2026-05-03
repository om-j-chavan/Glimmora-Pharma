"use client";

import { useParams } from "next/navigation";
import { AiCapaPage } from "@/modules/ai-capa/AiCapaPage";
import { ErrorBoundary } from "@/components/errors";

export default function Page() {
  const params = useParams();
  const raw = params?.capaId;
  const capaId = Array.isArray(raw) ? raw[0] : (raw ?? "");
  return (
    <ErrorBoundary moduleName="AI CAPA Lifecycle">
      <AiCapaPage capaId={decodeURIComponent(capaId)} />
    </ErrorBoundary>
  );
}
