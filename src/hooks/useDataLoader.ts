import { useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useAppDispatch } from "./useAppDispatch";
import { useAppSelector } from "./useAppSelector";
import { setFindings, setFindingsLoading, setFindingsError } from "@/store/findings.slice";
import { setCAPAs, setCAPAsLoading, setCAPAsError } from "@/store/capa.slice";
import { setDeviations, setDeviationsLoading, setDeviationsError } from "@/store/deviation.slice";
import { setSystems, setSystemsLoading, setSystemsError } from "@/store/systems.slice";
import { setFDA483Events, setFDA483Loading, setFDA483Error } from "@/store/fda483.slice";
import { setRAIDItems, setRAIDLoading, setRAIDError } from "@/store/raid.slice";
import { setDocuments, setEvidenceLoading, setEvidenceError } from "@/store/evidence.slice";
import { setAuditEntries } from "@/store/auditTrail.slice";
import { setReadinessData } from "@/store/readiness.slice";

export function useDataLoader() {
  const { data: session, status } = useSession();
  const dispatch = useAppDispatch();
  const isAuthenticatedRedux = useAppSelector((s) => !!s.auth.user);
  const hasLoadedRef = useRef(false);

  const loadFindings = useCallback(async () => {
    dispatch(setFindingsLoading(true));
    try {
      const res = await fetch("/api/findings");
      if (!res.ok) throw new Error("Failed to fetch findings");
      const data = await res.json();
      dispatch(setFindings(data));
    } catch (error) {
      dispatch(setFindingsError(error instanceof Error ? error.message : "Failed to fetch findings"));
    }
  }, [dispatch]);

  const loadCAPAs = useCallback(async () => {
    dispatch(setCAPAsLoading(true));
    try {
      const res = await fetch("/api/capas");
      if (!res.ok) throw new Error("Failed to fetch CAPAs");
      const data = await res.json();
      dispatch(setCAPAs(data));
    } catch (error) {
      dispatch(setCAPAsError(error instanceof Error ? error.message : "Failed to fetch CAPAs"));
    }
  }, [dispatch]);

  const loadDeviations = useCallback(async () => {
    dispatch(setDeviationsLoading(true));
    try {
      const res = await fetch("/api/deviations");
      if (!res.ok) throw new Error("Failed to fetch deviations");
      const data = await res.json();
      dispatch(setDeviations(data));
    } catch (error) {
      dispatch(setDeviationsError(error instanceof Error ? error.message : "Failed to fetch deviations"));
    }
  }, [dispatch]);

  const loadSystems = useCallback(async () => {
    dispatch(setSystemsLoading(true));
    try {
      const res = await fetch("/api/systems");
      if (!res.ok) throw new Error("Failed to fetch systems");
      const data = await res.json();
      dispatch(setSystems(data));
    } catch (error) {
      dispatch(setSystemsError(error instanceof Error ? error.message : "Failed to fetch systems"));
    }
  }, [dispatch]);

  const loadFDA483 = useCallback(async () => {
    dispatch(setFDA483Loading(true));
    try {
      const res = await fetch("/api/fda483");
      if (!res.ok) throw new Error("Failed to fetch FDA 483 events");
      const data = await res.json();
      dispatch(setFDA483Events(data));
    } catch (error) {
      dispatch(setFDA483Error(error instanceof Error ? error.message : "Failed to fetch FDA 483 events"));
    }
  }, [dispatch]);

  const loadRAID = useCallback(async () => {
    dispatch(setRAIDLoading(true));
    try {
      const res = await fetch("/api/raid");
      if (!res.ok) throw new Error("Failed to fetch RAID items");
      const data = await res.json();
      dispatch(setRAIDItems(data));
    } catch (error) {
      dispatch(setRAIDError(error instanceof Error ? error.message : "Failed to fetch RAID items"));
    }
  }, [dispatch]);

  const loadDocuments = useCallback(async () => {
    dispatch(setEvidenceLoading(true));
    try {
      const res = await fetch("/api/documents");
      if (!res.ok) throw new Error("Failed to fetch documents");
      const data = await res.json();
      dispatch(setDocuments(data));
    } catch (error) {
      dispatch(setEvidenceError(error instanceof Error ? error.message : "Failed to fetch documents"));
    }
  }, [dispatch]);

  const loadAuditTrail = useCallback(async () => {
    try {
      const res = await fetch("/api/audit-trail");
      if (!res.ok) {
        // Don't throw - just log and return empty
        console.warn("Audit trail API returned:", res.status);
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        dispatch(setAuditEntries(data));
      }
    } catch (error) {
      console.warn("Failed to load audit trail:", error);
    }
  }, [dispatch]);

  const loadReadiness = useCallback(async () => {
    try {
      const res = await fetch("/api/readiness");
      if (!res.ok) {
        // Don't throw - just log and return empty
        console.warn("Readiness API returned:", res.status);
        return;
      }
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
      loadFDA483(),
      loadRAID(),
      loadDocuments(),
      loadAuditTrail(),
      loadReadiness(),
    ]);
  }, [loadFindings, loadCAPAs, loadDeviations, loadSystems, loadFDA483, loadRAID, loadDocuments, loadAuditTrail, loadReadiness]);

  // Check if any data exists in the store
  const hasData = useAppSelector((s) =>
    (s.findings?.items?.length ?? 0) > 0 ||
    (s.capa?.items?.length ?? 0) > 0 ||
    (s.systems?.items?.length ?? 0) > 0
  );

  useEffect(() => {
    // Load data when user is authenticated via NextAuth OR Redux
    const isAuthenticated = status === "authenticated" || isAuthenticatedRedux;

    console.log("[useDataLoader] Auth check:", {
      nextAuthStatus: status,
      hasSession: !!session,
      reduxAuth: isAuthenticatedRedux,
      hasLoaded: hasLoadedRef.current,
      hasData
    });

    // Load data if authenticated and either:
    // 1. Haven't loaded yet, OR
    // 2. Store is empty (data might have been cleared)
    if (isAuthenticated && (!hasLoadedRef.current || !hasData)) {
      console.log("[useDataLoader] Loading data...", {
        reason: !hasLoadedRef.current ? "first load" : "store empty"
      });
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
    loadFDA483,
    loadRAID,
    loadDocuments,
    loadAuditTrail,
    loadReadiness,
  };
}
