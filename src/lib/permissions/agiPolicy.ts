/**
 * The AGI agent policy — one definition, shared by the settings UI, the server
 * actions that persist it, and the proxy that ENFORCES it.
 *
 * ── Why enforcement lives at the proxy ────────────────────────
 * The policy used to be a Redux slice in the browser. Panels read it to hide a
 * button, and that was the whole of it: the endpoints answered regardless, so a
 * "disabled" agent still ran for anyone who called it directly, and every user
 * in an organisation had their own private copy of the policy in localStorage.
 *
 * Every browser AI call passes through `app/api/ai-proxy/[...path]`. Putting the
 * check there means a disabled agent is unreachable no matter which component
 * (or user, or curl invocation) tries — the UI's hidden button becomes an
 * affordance rather than the control.
 *
 * Adding an agent: add a key here with the upstream paths it owns, add the
 * matching column to `TenantAgiPolicy`, and both the UI and the proxy pick it up.
 */

/** The agent keys. Order drives the settings list. */
export const AGI_AGENT_KEYS = [
  "capa",
  "deviation",
  "fda483",
  "drift",
  "regulatory",
  "supplier",
] as const;

export type AgiAgentKey = (typeof AGI_AGENT_KEYS)[number];

export type AgiAgents = Record<AgiAgentKey, boolean>;

export interface AgiPolicy {
  agents: AgiAgents;
  /** Advisory display threshold (0-100). Presentational; gates nothing. */
  confidence: number;
  /** Derived from the agent set — never stored, so it cannot disagree. */
  mode: "autonomous" | "assisted" | "manual";
}

/** Matches the column defaults on `TenantAgiPolicy`, so a tenant with no row
 *  behaves exactly as one with a freshly created row. */
export const DEFAULT_AGI_AGENTS: AgiAgents = {
  capa: true,
  deviation: true,
  fda483: true,
  drift: true,
  regulatory: true,
  supplier: true,
};

export const DEFAULT_AGI_CONFIDENCE = 72;

/**
 * Which upstream AI paths each agent owns.
 *
 * Matched as a case-insensitive prefix against the joined proxy path. Only
 * FEATURE endpoints appear here — the conversational assistant, search, summary
 * and draft helpers are general-purpose tools, not policy-governed agents, and
 * turning off "CAPA" must not silently break the chatbot.
 */
export const AGENT_PATHS: Record<AgiAgentKey, readonly string[]> = {
  capa: [
    "api/v1/capa-recurrence/",
    "api/v1/capa-prefill/",
    "api/v1/capa-approval-brief/",
    "api/v1/capa-readiness-guidance/",
    "api/v1/rca-suggestions/",
  ],
  deviation: ["api/v1/deviation-intelligence/", "api/v1/deviation-rca/"],
  fda483: ["api/v1/response-draft/", "api/v1/fda483-extraction/"],
  drift: ["api/v1/drift-detection/", "api/v1/document-review/", "api/v1/rework-tasks/"],
  regulatory: ["api/v1/regulatory-intelligence/", "api/v1/finding-triage/"],
  // No endpoint yet — the Supplier Quality agent is described in the policy UI
  // but not implemented. Listed so the toggle exists and does nothing
  // surprising when the endpoint lands.
  supplier: [],
};

/** Health probes stay reachable regardless of policy — an operator must be able
 *  to check a disabled agent's configuration. */
const ALWAYS_ALLOWED_SUFFIXES = ["/health"];

/**
 * The agent that owns an upstream path, or null when the path is not
 * policy-governed (assistant, search, summarize, draft, voice, audit).
 */
export function agentForPath(path: string): AgiAgentKey | null {
  const lower = path.toLowerCase();
  if (ALWAYS_ALLOWED_SUFFIXES.some((s) => lower.endsWith(s))) return null;
  for (const key of AGI_AGENT_KEYS) {
    if (AGENT_PATHS[key].some((p) => lower.startsWith(p))) return key;
  }
  return null;
}

/**
 * True when this tenant's policy permits calling `path`.
 *
 * Fails OPEN for unrecognised paths — the allowlist in the proxy already
 * decides what may be proxied at all; this decides only which of those a
 * tenant has switched off.
 */
export function isAgentAllowed(path: string, agents: AgiAgents): boolean {
  const key = agentForPath(path);
  if (key === null) return true;
  return agents[key] !== false;
}

/** Operating mode, derived from how many agents are on. */
export function computeAgiMode(agents: AgiAgents): AgiPolicy["mode"] {
  const values = AGI_AGENT_KEYS.map((k) => agents[k]);
  const active = values.filter(Boolean).length;
  if (active === 0) return "manual";
  if (active < values.length) return "assisted";
  return "autonomous";
}

/** Roles permitted to change the policy. Deliberately narrow: this governs what
 *  AI may run against the tenant's regulated records. */
export const AGI_POLICY_EDIT_ROLES = ["customer_admin", "qa_head"] as const;

export function canEditAgiPolicy(role: string): boolean {
  return (AGI_POLICY_EDIT_ROLES as readonly string[]).includes(role);
}
