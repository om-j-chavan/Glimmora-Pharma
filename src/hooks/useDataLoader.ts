import { useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query"; // ✅ Added React Query
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
  const queryClient = useQueryClient(); // ✅ Initialize queryClient
  const isAuthenticatedRedux = useAppSelector((s) => !!s.auth.user);
  const hasLoadedRef = useRef(false);

  const STALE_TIME = 1000 * 60 * 5; // 5 minutes cache

  const loadFindings = useCallback(async () => {
    dispatch(setFindingsLoading(true));
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ["findings"],
        queryFn: async () => {
          const res = await fetch("/api/findings");
          if (!res.ok) throw new Error("Failed to fetch findings");
          return res.json();
        },
        staleTime: STALE_TIME,
      });
      dispatch(setFindings(data));
    } catch (error) {
      dispatch(setFindingsError(error instanceof Error ? error.message : "Failed to fetch findings"));
    }
  }, [dispatch, queryClient]);

  const loadCAPAs = useCallback(async () => {
    dispatch(setCAPAsLoading(true));
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ["capas"],
        queryFn: async () => {
          const res = await fetch("/api/capas");
          if (!res.ok) throw new Error("Failed to fetch CAPAs");
          return res.json();
        },
        staleTime: STALE_TIME,
      });
      dispatch(setCAPAs(data));
    } catch (error) {
      dispatch(setCAPAsError(error instanceof Error ? error.message : "Failed to fetch CAPAs"));
    }
  }, [dispatch, queryClient]);

  const loadDeviations = useCallback(async () => {
    dispatch(setDeviationsLoading(true));
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ["deviations"],
        queryFn: async () => {
          const res = await fetch("/api/deviations");
          if (!res.ok) throw new Error("Failed to fetch deviations");
          return res.json();
        },
        staleTime: STALE_TIME,
      });
      dispatch(setDeviations(data));
    } catch (error) {
      dispatch(setDeviationsError(error instanceof Error ? error.message : "Failed to fetch deviations"));
    }
  }, [dispatch, queryClient]);

  const loadSystems = useCallback(async () => {
    dispatch(setSystemsLoading(true));
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ["systems"],
        queryFn: async () => {
          const res = await fetch("/api/systems");
          if (!res.ok) throw new Error("Failed to fetch systems");
          return res.json();
        },
        staleTime: STALE_TIME,
      });
      dispatch(setSystems(data));
    } catch (error) {
      dispatch(setSystemsError(error instanceof Error ? error.message : "Failed to fetch systems"));
    }
  }, [dispatch, queryClient]);

  const loadFDA483 = useCallback(async () => {
    dispatch(setFDA483Loading(true));
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ["fda483"],
        queryFn: async () => {
          const res = await fetch("/api/fda483");
          if (!res.ok) throw new Error("Failed to fetch FDA 483 events");
          return res.json();
        },
        staleTime: STALE_TIME,
      });
      dispatch(setFDA483Events(data));
    } catch (error) {
      dispatch(setFDA483Error(error instanceof Error ? error.message : "Failed to fetch FDA 483 events"));
    }
  }, [dispatch, queryClient]);

  const loadRAID = useCallback(async () => {
    dispatch(setRAIDLoading(true));
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ["raid"],
        queryFn: async () => {
          const res = await fetch("/api/raid");
          if (!res.ok) throw new Error("Failed to fetch RAID items");
          return res.json();
        },
        staleTime: STALE_TIME,
      });
      dispatch(setRAIDItems(data));
    } catch (error) {
      dispatch(setRAIDError(error instanceof Error ? error.message : "Failed to fetch RAID items"));
    }
  }, [dispatch, queryClient]);

  const loadDocuments = useCallback(async () => {
    dispatch(setEvidenceLoading(true));
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ["documents"],
        queryFn: async () => {
          const res = await fetch("/api/documents");
          if (!res.ok) throw new Error("Failed to fetch documents");
          return res.json();
        },
        staleTime: STALE_TIME,
      });
      dispatch(setDocuments(data));
    } catch (error) {
      dispatch(setEvidenceError(error instanceof Error ? error.message : "Failed to fetch documents"));
    }
  }, [dispatch, queryClient]);

  const loadAuditTrail = useCallback(async () => {
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ["audit-trail"],
        queryFn: async () => {
          const res = await fetch("/api/audit-trail");
          if (!res.ok) {
            console.warn("Audit trail API returned:", res.status);
            return null; // Return null instead of throwing for this specific endpoint
          }
          return res.json();
        },
        staleTime: STALE_TIME,
      });
      
      if (data && Array.isArray(data)) {
        dispatch(setAuditEntries(data));
      }
    } catch (error) {
      console.warn("Failed to load audit trail:", error);
    }
  }, [dispatch, queryClient]);

  const loadReadiness = useCallback(async () => {
    try {
      const data = await queryClient.fetchQuery({
        queryKey: ["readiness"],
        queryFn: async () => {
          const res = await fetch("/api/readiness");
          if (!res.ok) {
            console.warn("Readiness API returned:", res.status);
            return null;
          }
          return res.json();
        },
        staleTime: STALE_TIME,
      });

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
  }, [dispatch, queryClient]);

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
    loadFDA483,
    loadRAID,
    loadDocuments,
    loadAuditTrail,
    loadReadiness,
  };
}
