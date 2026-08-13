"use client";

/**
 * Read the tenant's AI agent policy from the server.
 *
 * Panels used to read `useAppSelector((s) => s.settings.agi…)`. That slice was
 * per-browser localStorage state no server consulted, so the switch a QA Head
 * flipped had no effect on anyone else — or on any endpoint. The policy is now
 * tenant-scoped server state (`TenantAgiPolicy`), enforced in the AI proxy.
 *
 * This hook is a UI affordance, not the control: hiding a trigger is a courtesy
 * so users do not click something that will 403. The binding decision happens
 * server-side in `app/api/ai-proxy/[...path]/route.ts` regardless of what this
 * returns.
 *
 * One in-flight request is shared across every component that mounts in the
 * same session — nine panels reading the policy must not mean nine round trips.
 * The cache is per page load; a policy change re-renders through the settings
 * screen's own state and is picked up on the next navigation.
 */

import { useEffect, useState } from "react";
import { loadAgiPolicy } from "@/actions/agi-policy";
import {
  DEFAULT_AGI_AGENTS,
  DEFAULT_AGI_CONFIDENCE,
  computeAgiMode,
  type AgiAgentKey,
  type AgiPolicy,
} from "@/lib/permissions/agiPolicy";

const FALLBACK: AgiPolicy = {
  agents: { ...DEFAULT_AGI_AGENTS },
  confidence: DEFAULT_AGI_CONFIDENCE,
  mode: computeAgiMode(DEFAULT_AGI_AGENTS),
};

let cached: AgiPolicy | null = null;
let inFlight: Promise<AgiPolicy> | null = null;

function fetchPolicy(): Promise<AgiPolicy> {
  if (cached) return Promise.resolve(cached);
  if (!inFlight) {
    inFlight = loadAgiPolicy()
      .then((p) => {
        cached = p;
        return p;
      })
      .catch((err) => {
        // Fail OPEN to the defaults: a policy read failure must not make every
        // AI trigger disappear from the UI. The server still enforces.
        console.error("[agi-policy] could not load; using defaults", err);
        return FALLBACK;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Clear the cache so the next read re-fetches (used after a policy edit). */
export function invalidateAgiPolicy(): void {
  cached = null;
}

export function useAgiPolicy(): AgiPolicy {
  const [policy, setPolicy] = useState<AgiPolicy>(cached ?? FALLBACK);

  useEffect(() => {
    let cancelled = false;
    void fetchPolicy().then((p) => {
      if (!cancelled) setPolicy(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return policy;
}

/**
 * True when `agent` is enabled for this tenant AND the org is not in fully
 * manual mode — the same two conditions the panels checked before, in one place
 * so they cannot drift apart.
 */
export function useAgentActive(agent: AgiAgentKey): boolean {
  const policy = useAgiPolicy();
  return policy.mode !== "manual" && policy.agents[agent] !== false;
}
