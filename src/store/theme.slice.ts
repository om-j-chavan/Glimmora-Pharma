import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type Theme = "dark" | "light";

export type ColorTheme =
  | "sky-blue"
  | "ocean-blue"
  | "teal"
  | "emerald"
  | "forest-green"
  | "indigo-navy"
  | "royal-purple"
  | "rose-pink"
  | "crimson-red"
  | "orange"
  | "amber-gold"
  | "coffee-brown"
  | "terracotta"
  | "slate-gray";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem("glimmora-theme");
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // ignore
  }
  return "light";
}

function persistTheme(next: Theme) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("glimmora-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  } catch {
    // ignore
  }
}

function getInitialColorTheme(): ColorTheme {
  try {
    return (
      (localStorage.getItem("glimmora-color-theme") as ColorTheme) ?? "coffee-brown"
    );
  } catch {
    return "coffee-brown";
  }
}

const themeSlice = createSlice({
  name: "theme",
  initialState: {
    mode: getInitialTheme(),
    colorTheme: getInitialColorTheme(),
  } as { mode: Theme; colorTheme: ColorTheme },
  reducers: {
    toggleTheme(state) {
      const next: Theme = state.mode === "dark" ? "light" : "dark";
      state.mode = next;
      persistTheme(next);
    },
    setTheme(state, { payload }: PayloadAction<Theme>) {
      state.mode = payload;
      persistTheme(payload);
    },
    setColorTheme(state, { payload }: PayloadAction<ColorTheme>) {
      state.colorTheme = payload;
    },
  },
});

export const { toggleTheme, setTheme, setColorTheme } = themeSlice.actions;
export default themeSlice.reducer;
