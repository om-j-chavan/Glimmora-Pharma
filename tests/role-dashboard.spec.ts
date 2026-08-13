import { test, expect, type Page } from "@playwright/test";

/**
 * ROLE-BASED DASHBOARD — runtime verification (Phase 10).
 *
 * `scripts/verify-role-dashboards.ts` proves the RESOLVER is correct for all ten
 * roles against the real matrix + role-sets. This spec proves the resulting page
 * actually RENDERS for each seat role in the browser: right KPIs, right widgets,
 * no leaked links, no uncaught/hydration errors.
 *
 * Users are the `prisma/seed.ts` seat accounts on tenant "Pharma Glimmora
 * International" (all share Demo@123). Every role in that tenant is covered; `viewer`
 * has no seeded account, so its (read-only, zero-action) resolution is asserted by
 * the resolver harness instead.
 */

const PASSWORD = "Demo@123";

interface RoleCase {
  role: string;
  email: string;
  /** KPI card labels that MUST be present. */
  expectKpis: string[];
  /** Widget headings that MUST be present. */
  expectWidgets: string[];
  /** Widget headings that must NOT be present. */
  forbidWidgets?: string[];
  /**
   * Routes this role may NOT open — the dashboard must contain no anchor to them.
   * This is the audit's headline leak, asserted per role.
   */
  forbidHrefs: string[];
}

const CASES: RoleCase[] = [
  {
    role: "qa_head",
    email: "qa@pharmaglimmora.com",
    expectKpis: ["Open deviations", "Open CAPAs", "CAPA overdue", "Audit findings", "Training compliance", "Risk score"],
    expectWidgets: ["Quality Signals", "My pending tasks", "Quick actions", "Risk signals", "90-day action plan"],
    forbidHrefs: [],
  },
  {
    role: "regulatory_affairs",
    email: "ra@pharmaglimmora.com",
    expectKpis: ["Open 483 events", "Response deadlines", "Inspection readiness", "Open commitments", "Open observations"],
    expectWidgets: ["Regulatory calendar", "Regulatory Signals", "Compliance status"],
    forbidWidgets: ["Tenant health"],
    // regulatory_affairs is in neither CAPA_MODULE_VIEW_ROLES nor GOVERNANCE_VIEW_ROLES
    // nor AUDIT_TRAIL_VIEW_ROLES.
    forbidHrefs: ["/capa", "/governance", "/audit-trail"],
  },
  {
    role: "csv_val_lead",
    email: "csv@pharmaglimmora.com",
    expectKpis: ["Validated systems", "Pending validation", "CSV high risk", "Qualification progress", "Validation drift"],
    expectWidgets: ["Validation lifecycle", "Validation Signals", "Quick actions"],
    forbidWidgets: ["Tenant health"],
    forbidHrefs: ["/capa", "/governance", "/audit-trail"],
  },
  {
    role: "qc_lab_director",
    email: "qc@pharmaglimmora.com",
    expectKpis: ["Lab deviations", "Lab investigations", "Lab findings", "Lab CAPAs overdue", "Lab readiness"],
    expectWidgets: ["Laboratory Signals", "Risk signals"],
    forbidWidgets: ["Tenant health", "Validation lifecycle"],
    forbidHrefs: ["/capa", "/governance", "/audit-trail"],
  },
  {
    role: "operations_head",
    email: "ops@pharmaglimmora.com",
    expectKpis: ["Manufacturing deviations", "Batch-impacting", "Equipment-related", "Investigations pending", "Operational readiness"],
    expectWidgets: ["Operational Signals", "Risk signals"],
    // Change Control is behind CHANGE_CONTROL_ENABLED (false) — its widget must NOT
    // render and nothing may link to the redirecting route.
    forbidWidgets: ["Change control status", "Tenant health"],
    forbidHrefs: ["/capa", "/governance", "/audit-trail", "/change-control"],
  },
  {
    role: "it_cdo",
    email: "it@pharmaglimmora.com",
    expectKpis: ["Validated systems", "Pending validation", "Part 11 gaps", "Validation drift", "Qualification progress"],
    expectWidgets: ["Validation lifecycle", "Compliance status"],
    forbidWidgets: ["Tenant health"],
    forbidHrefs: ["/capa", "/governance", "/audit-trail"],
  },
  {
    role: "qa",
    email: "qa.exec@pharmaglimmora.com",
    expectKpis: ["Open deviations", "Open CAPAs", "Audit findings", "Training compliance", "Overall readiness"],
    expectWidgets: ["My pending tasks", "Quality Signals"],
    forbidWidgets: ["Tenant health"],
    forbidHrefs: ["/capa", "/governance", "/audit-trail"],
  },
];

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => u.pathname === "/" || u.pathname.startsWith("/site-picker"), { timeout: 25_000 });
  if (page.url().includes("/site-picker")) {
    await page.getByRole("button", { name: /all sites|continue|dashboard/i }).first().click().catch(() => {});
    await page.waitForURL((u) => u.pathname === "/", { timeout: 25_000 }).catch(() => {});
  }
}

const isHydration = (s: string) => /hydrat|did not match|Text content does not match/i.test(s);

for (const c of CASES) {
  test(`dashboard renders for ${c.role}`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => pageErrors.push(e.message));

    await login(page, c.email);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 20_000 });

    /* ── The role's own KPI cards ── */
    for (const label of c.expectKpis) {
      // StatCard renders as a <a aria-label="Label: value. sub"> when linked and a
      // role="region" aria-label="Label" when not — accept either.
      const card = page.locator(
        `a[aria-label^="${label}:"], [role="region"][aria-label="${label}"]`,
      );
      await expect(card.first(), `${c.role}: KPI "${label}" should render`).toBeVisible({ timeout: 15_000 });
    }

    /* ── The role's widgets ── */
    for (const heading of c.expectWidgets) {
      await expect(
        page.getByText(heading, { exact: false }).first(),
        `${c.role}: widget "${heading}" should render`,
      ).toBeVisible({ timeout: 15_000 });
    }
    for (const heading of c.forbidWidgets ?? []) {
      await expect(
        page.getByText(heading, { exact: false }),
        `${c.role}: widget "${heading}" must NOT render`,
      ).toHaveCount(0);
    }

    /* ── PERMISSION LEAK CHECK — no anchor into a denied module ──
       The pre-role dashboard hard-linked every role to /capa, /csv-csa, /fda-483 and
       /governance with live counts. Assert the dashboard body contains no such link. */
    for (const bad of c.forbidHrefs) {
      const links = page.locator(`main a[href^="${bad}"]`);
      const count = await links.count();
      const hrefs = count > 0 ? await links.evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href"))) : [];
      expect(count, `${c.role}: dashboard leaks ${count} link(s) to ${bad}: ${hrefs.join(", ")}`).toBe(0);
    }

    /* ── No runtime errors ── */
    const hydration = [...consoleErrors, ...pageErrors].filter(isHydration);
    expect(pageErrors, `${c.role}: uncaught page errors:\n${pageErrors.join("\n")}`).toHaveLength(0);
    expect(hydration, `${c.role}: hydration warnings:\n${hydration.join("\n")}`).toHaveLength(0);
  });
}
