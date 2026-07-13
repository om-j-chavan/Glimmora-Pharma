"use client";

import { useEffect, useState } from "react";
import { Rows3, Rows4 } from "lucide-react";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import { toggleDensity } from "@/store/theme.slice";

/** Comfortable / compact row-density switch. Sits beside the theme controls
 *  in the topbar. QA reviewers scanning long record lists can pack more rows
 *  on screen. Hydration-safe: renders the server default ("comfortable") on
 *  the first client render, then swaps after mount. */
export function DensityToggle() {
  const dispatch = useAppDispatch();
  const density = useAppSelector((s) => s.theme?.density ?? "comfortable");
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const isCompact = mounted && density === "compact";

  return (
    <button
      type="button"
      onClick={() => dispatch(toggleDensity())}
      aria-label={isCompact ? "Switch to comfortable density" : "Switch to compact density"}
      aria-pressed={isCompact}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        transition: "all 0.15s",
        background: "var(--bg-elevated)",
        border: "1px solid var(--bg-border)",
        color: "var(--text-secondary)",
      }}
    >
      {isCompact ? (
        <>
          <Rows3 size={13} aria-hidden="true" /> Compact
        </>
      ) : (
        <>
          <Rows4 size={13} aria-hidden="true" /> Comfortable
        </>
      )}
    </button>
  );
}
