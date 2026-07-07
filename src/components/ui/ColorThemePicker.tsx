import { Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import { setColorTheme, type ColorTheme } from "@/store/theme.slice";

const THEMES: { id: ColorTheme; label: string; color: string }[] = [
  { id: "sky-blue", label: "Sky Blue", color: "#0ea5e9" },
  { id: "ocean-blue", label: "Ocean Blue", color: "#4a7fa8" },
  { id: "teal", label: "Teal", color: "#14b8a6" },
  { id: "emerald", label: "Emerald", color: "#10b981" },
  { id: "forest-green", label: "Forest Green", color: "#4a8f6a" },
  { id: "indigo-navy", label: "Indigo Navy", color: "#6366f1" },
  { id: "royal-purple", label: "Royal Purple", color: "#7b68a5" },
  { id: "rose-pink", label: "Rose Pink", color: "#e11d48" },
  { id: "crimson-red", label: "Crimson Red", color: "#a5484a" },
  { id: "orange", label: "Orange", color: "#ea580c" },
  { id: "amber-gold", label: "Amber Gold", color: "#d97706" },
  { id: "coffee-brown", label: "Coffee Brown", color: "#8b6914" },
  { id: "terracotta", label: "Terracotta", color: "#a57865" },
  { id: "slate-gray", label: "Slate Gray", color: "#6b7b8d" },
];

// Server default — getInitialColorTheme() falls back to "emerald" when there is
// no localStorage (i.e. during SSR). The swatch must render this on the first
// client paint too, or the stored theme mismatches the server HTML at hydration.
const DEFAULT_THEME = THEMES.find((t) => t.id === "emerald") ?? THEMES[0];

export function ColorThemePicker() {
  const dispatch = useAppDispatch();
  const colorTheme = useAppSelector((s) => s.theme.colorTheme);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Render the server-produced value ("emerald") on the first client render,
  // then swap to the real (localStorage-backed) theme after mount — mirrors the
  // ThemeToggle hydration guard, avoiding a swatch-colour hydration mismatch.
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleSelect = (theme: ColorTheme) => {
    dispatch(setColorTheme(theme));
    localStorage.setItem("glimmora-color-theme", theme);
    document.documentElement.setAttribute("data-color-theme", theme);
    setOpen(false);
  };

  const current = mounted ? (THEMES.find((t) => t.id === colorTheme) ?? DEFAULT_THEME) : DEFAULT_THEME;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Pick color theme"
        aria-expanded={open}
        aria-haspopup="menu"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
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
        <span
          aria-hidden="true"
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: current.color,
            flexShrink: 0,
          }}
        />
        <Palette size={13} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Color themes"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 50,
            background: "var(--bg-elevated)",
            border: "1px solid var(--bg-border)",
            borderRadius: 10,
            padding: 10,
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 6,
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}
        >
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitem"
              aria-label={t.label}
              aria-pressed={colorTheme === t.id}
              onClick={() => handleSelect(t.id)}
              title={t.label}
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: t.color,
                border:
                  colorTheme === t.id
                    ? "2px solid var(--text-primary)"
                    : "2px solid transparent",
                cursor: "pointer",
                outline: "none",
                transition: "transform 0.1s, box-shadow 0.1s",
                boxShadow:
                  colorTheme === t.id
                    ? `0 0 0 2px var(--bg-elevated), 0 0 0 4px ${t.color}`
                    : "none",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
