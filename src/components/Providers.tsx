"use client";

import { useEffect, useRef } from "react";
import { SessionProvider } from "next-auth/react";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { store, rehydrateState } from "@/store";
import { readPersistedStateFromStorage } from "@/store/persistence";
import { useAppSelector } from "@/hooks/useAppSelector";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 1000 * 60 * 5 } },
});

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

/** Rehydrates Redux from localStorage after the first client render so SSR
 *  and CSR start from identical state, then layers persisted slices on top. */
function PersistenceRehydrator() {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const persisted = readPersistedStateFromStorage();
    if (persisted) store.dispatch(rehydrateState(persisted));
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <PersistenceRehydrator />
          <ThemeSync />
          {children}
        </QueryClientProvider>
      </Provider>
    </SessionProvider>
  );
}
