"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export function CAPADetailPage() {
  const { id } = useParams();
  const router = useRouter();

  useEffect(() => {
    router.push(`/capa?openCapaId=${encodeURIComponent(String(id))}`);
  }, [id, router]);

  return null;
}
