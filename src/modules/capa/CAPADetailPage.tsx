"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export function CAPADetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();

  useEffect(() => {
    router.push(`/capa?openCapaId=${encodeURIComponent(String(id))}`);
  }, [id, router]);

  return null;
}
