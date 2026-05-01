"use client";

import { useEffect, useRef } from "react";
import { SessionProvider } from "next-auth/react";
import { Provider } from "react-redux";
import { store } from "@/store";
import { useAppSelector } from "@/hooks/useAppSelector";

function ThemeSync() {
  const theme = useAppSelector((s) => s.theme?.mode);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
  }, [theme]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Provider store={store}>
        <ThemeSync />
        {children}
      </Provider>
    </SessionProvider>
  );
}
