"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import { toggleTheme } from "@/store/theme.slice";

export function ThemeToggle() {
  const dispatch = useAppDispatch();
  const mode = useAppSelector((s) => s.theme?.mode ?? "light");
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  // Render the same output the server produced ("light") on the first
  // client render, then swap to the real value after mount. Without this
  // the button hydrates with mismatched aria-label / icon when the user's
  // saved theme differs from the server default.
  const isDark = mounted && mode === "dark";

  return (
    <button
      type="button"
      onClick={() => dispatch(toggleTheme())}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={!isDark}
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
      {isDark ? (
        <>
          <Sun size={13} aria-hidden="true" /> Light
        </>
      ) : (
        <>
          <Moon size={13} aria-hidden="true" /> Dark
        </>
      )}
    </button>
  );
}
