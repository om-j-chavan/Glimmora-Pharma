import { useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useAppDispatch } from "./useAppDispatch";
import { useAppSelector } from "./useAppSelector";
import { setFindings } from "@/store/findings.slice";
import { setCAPAs } from "@/store/capa.slice";
import { setDeviations } from "@/store/deviation.slice";
import { setSystems } from "@/store/systems.slice";
import { setReadinessData } from "@/store/readiness.slice";

/**
 * Data loader hook for client-side data fetching.
 * Note: devAI uses server-first architecture, so most data is fetched server-side.
 * This hook provides fallback client-side loading for specific use cases.
 */
export function useDataLoader() {
  const { data: session, status } = useSession();
  const dispatch = useAppDispatch();
  const isAuthenticatedRedux = useAppSelector((s) => !!s.auth.user);
  const hasLoadedRef = useRef(false);

  const loadFindings = useCallback(async () => {
    try {
      const res = await fetch("/api/findings");
      if (!res.ok) return;
      const data = await res.json();
      dispatch(setFindings(data));
    } catch (error) {
      console.warn("Failed to load findings:", error);
    }
  }, [dispatch]);

  const loadCAPAs = useCallback(async () => {
    try {
      const res = await fetch("/api/capas");
      if (!res.ok) return;
      const data = await res.json();
      dispatch(setCAPAs(data));
    } catch (error) {
      console.warn("Failed to load CAPAs:", error);
    }
  }, [dispatch]);

  const loadDeviations = useCallback(async () => {
    try {
      const res = await fetch("/api/deviations");
      if (!res.ok) return;
      const data = await res.json();
      dispatch(setDeviations(data));
    } catch (error) {
      console.warn("Failed to load deviations:", error);
    }
  }, [dispatch]);

  const loadSystems = useCallback(async () => {
    try {
      const res = await fetch("/api/systems");
      if (!res.ok) return;
      const data = await res.json();
      dispatch(setSystems(data));
    } catch (error) {
      console.warn("Failed to load systems:", error);
    }
  }, [dispatch]);

  const loadReadiness = useCallback(async () => {
    try {
      const res = await fetch("/api/readiness");
      if (!res.ok) return;
      const data = await res.json();
      if (data && typeof data === "object") {
        dispatch(setReadinessData({
          inspections: data.inspections || [],
          cards: data.cards || [],
          playbooks: data.playbooks || [],
          simulations: data.simulations || [],
          training: data.training || [],
        }));
      }
    } catch (error) {
      console.warn("Failed to load readiness data:", error);
    }
  }, [dispatch]);

  const loadAllData = useCallback(async () => {
    await Promise.all([
      loadFindings(),
      loadCAPAs(),
      loadDeviations(),
      loadSystems(),
      loadReadiness(),
    ]);
  }, [loadFindings, loadCAPAs, loadDeviations, loadSystems, loadReadiness]);

  // Check if any data exists in the store
  const hasData = useAppSelector((s) =>
    (s.findings?.items?.length ?? 0) > 0 ||
    (s.capa?.items?.length ?? 0) > 0 ||
    (s.systems?.items?.length ?? 0) > 0
  );

  useEffect(() => {
    const isAuthenticated = status === "authenticated" || isAuthenticatedRedux;

    if (isAuthenticated && (!hasLoadedRef.current || !hasData)) {
      hasLoadedRef.current = true;
      loadAllData();
    }
  }, [status, session, isAuthenticatedRedux, hasData, loadAllData]);

  return {
    loadAllData,
    loadFindings,
    loadCAPAs,
    loadDeviations,
    loadSystems,
    loadReadiness,
  };
}
