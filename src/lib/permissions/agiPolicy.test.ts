import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  AGI_AGENT_KEYS,
  AGENT_PATHS,
  DEFAULT_AGI_AGENTS,
  agentForPath,
  canEditAgiPolicy,
  computeAgiMode,
  isAgentAllowed,
  type AgiAgents,
} from "./agiPolicy";

/**
 * The AGI policy used to be a Redux slice persisted to localStorage that no
 * server ever read — panels hid a button and the endpoints answered anyway. It
 * is now enforced in the AI proxy, which is the single doorway every browser AI
 * call passes through.
 *
 * These tests pin the mapping that enforcement depends on. A new agent endpoint
 * that nobody adds to AGENT_PATHS is silently ungoverned, which is precisely the
 * failure mode this replaced — so the coverage check below is the important one.
 */

function allOn(): AgiAgents {
  return { ...DEFAULT_AGI_AGENTS };
}

function allOff(): AgiAgents {
  return AGI_AGENT_KEYS.reduce((acc, k) => {
    acc[k] = false;
    return acc;
  }, {} as AgiAgents);
}

describe("agiPolicy — path → agent mapping", () => {
  it("maps each feature endpoint to the agent that owns it", () => {
    const cases: Array<[string, string]> = [
      ["api/v1/capa-recurrence/analyze", "capa"],
      ["api/v1/capa-prefill/generate", "capa"],
      ["api/v1/capa-approval-brief/generate", "capa"],
      ["api/v1/capa-readiness-guidance/generate", "capa"],
      ["api/v1/rca-suggestions/generate", "capa"],
      ["api/v1/deviation-intelligence/analyze", "deviation"],
      ["api/v1/deviation-rca/analyze", "deviation"],
      ["api/v1/response-draft/generate", "fda483"],
      ["api/v1/fda483-extraction/scan", "fda483"],
      ["api/v1/drift-detection/scan", "drift"],
      ["api/v1/document-review/scan", "drift"],
      ["api/v1/rework-tasks/suggest", "drift"],
      ["api/v1/regulatory-intelligence/scan", "regulatory"],
      ["api/v1/finding-triage/classify", "regulatory"],
    ];
    for (const [path, expected] of cases) {
      assert.equal(agentForPath(path), expected, `${path} should belong to ${expected}`);
    }
  });

  it("leaves general-purpose tools ungoverned by agent toggles", () => {
    // Turning off "CAPA" must not silently break the chatbot, search or the
    // audit trail — those are not policy-governed agents.
    for (const path of [
      "api/ai/assistant",
      "api/ai/help",
      "api/ai/search",
      "api/ai/summarize",
      "api/ai/draft",
      "api/ai/voice/chat",
      "api/ai/regulatory-assistant",
      "api/v1/audit/all",
      "api/v1/support-triage/classify",
    ]) {
      assert.equal(agentForPath(path), null, `${path} must not be agent-gated`);
    }
  });

  it("keeps health probes reachable even when the agent is off", () => {
    // An operator has to be able to check a disabled agent's configuration.
    assert.equal(agentForPath("api/v1/drift-detection/health"), null);
    assert.equal(isAgentAllowed("api/v1/drift-detection/health", allOff()), true);
  });

  it("is case-insensitive on the path", () => {
    assert.equal(agentForPath("API/V1/Drift-Detection/Scan"), "drift");
  });
});

describe("agiPolicy — enforcement decision", () => {
  it("permits everything when all agents are enabled", () => {
    const agents = allOn();
    for (const key of AGI_AGENT_KEYS) {
      for (const path of AGENT_PATHS[key]) {
        assert.equal(isAgentAllowed(`${path}anything`, agents), true);
      }
    }
  });

  it("blocks only the disabled agent's own paths", () => {
    const agents = { ...allOn(), drift: false };
    assert.equal(isAgentAllowed("api/v1/drift-detection/scan", agents), false);
    assert.equal(isAgentAllowed("api/v1/document-review/scan", agents), false);
    // A different agent's endpoint is unaffected.
    assert.equal(isAgentAllowed("api/v1/capa-prefill/generate", agents), true);
    assert.equal(isAgentAllowed("api/ai/assistant", agents), true);
  });

  it("blocks every governed endpoint in fully manual mode", () => {
    const agents = allOff();
    for (const key of AGI_AGENT_KEYS) {
      for (const path of AGENT_PATHS[key]) {
        assert.equal(
          isAgentAllowed(`${path}x`, agents),
          false,
          `${path} still permitted with ${key} disabled`,
        );
      }
    }
  });

  it("fails open for paths outside the policy's vocabulary", () => {
    // The proxy's own allowlist decides what may be proxied at all; this only
    // decides which of those a tenant has switched off.
    assert.equal(isAgentAllowed("api/v1/some-future-endpoint/run", allOff()), true);
  });
});

describe("agiPolicy — derived mode", () => {
  it("derives the operating mode from the agent set", () => {
    assert.equal(computeAgiMode(allOn()), "autonomous");
    assert.equal(computeAgiMode(allOff()), "manual");
    assert.equal(computeAgiMode({ ...allOn(), drift: false }), "assisted");
  });

  it("never stores mode separately from the agents that imply it", () => {
    // Mode is computed, so it cannot disagree with the toggles the way a
    // persisted copy could.
    const agents = { ...allOn(), capa: false, drift: false };
    assert.equal(computeAgiMode(agents), computeAgiMode({ ...agents }));
  });
});

describe("agiPolicy — who may change it", () => {
  it("permits only the organisation admin and QA head", () => {
    for (const role of ["customer_admin", "qa_head"]) {
      assert.equal(canEditAgiPolicy(role), true, `${role} should be able to edit`);
    }
    for (const role of [
      "viewer",
      "qa",
      "quality_assurance",
      "regulatory_affairs",
      "csv_val_lead",
      "it_cdo",
      "operations_head",
      "qc_lab_director",
      "super_admin",
      "",
      "not_a_role",
    ]) {
      assert.equal(canEditAgiPolicy(role), false, `${role} must not be able to edit`);
    }
  });
});

describe("agiPolicy — coverage", () => {
  it("declares a path set for every agent key", () => {
    for (const key of AGI_AGENT_KEYS) {
      assert.ok(Array.isArray(AGENT_PATHS[key]), `${key} has no AGENT_PATHS entry`);
    }
  });

  it("has a default for every agent key", () => {
    for (const key of AGI_AGENT_KEYS) {
      assert.equal(typeof DEFAULT_AGI_AGENTS[key], "boolean", `${key} has no default`);
    }
  });

  it("never assigns one path prefix to two agents", () => {
    // An overlap would make enforcement depend on key iteration order.
    const seen = new Map<string, string>();
    for (const key of AGI_AGENT_KEYS) {
      for (const path of AGENT_PATHS[key]) {
        const prior = seen.get(path);
        assert.equal(prior, undefined, `${path} claimed by both ${prior} and ${key}`);
        seen.set(path, key);
      }
    }
  });
});
