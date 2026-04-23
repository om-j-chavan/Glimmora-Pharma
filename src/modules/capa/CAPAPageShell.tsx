"use client";

import { useState } from "react";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { setCAPAs, type CAPA } from "@/store/capa.slice";
import { CAPAPage } from "./CAPAPage";

interface Props {
  capas: CAPA[];
  openCapaId?: string;
}

export function CAPAPageShell({ capas, openCapaId }: Props) {
  const dispatch = useAppDispatch();
  const [lastSig, setLastSig] = useState<string>("");

  const sig = capas.map((c) => `${c.id}:${c.status}`).join("|");
  if (sig !== lastSig) {
    dispatch(setCAPAs(capas));
    setLastSig(sig);
  }

  return <CAPAPage openCapaId={openCapaId} />;
}
