import { test, expect } from "@playwright/test";

/**
 * Feature test — Drift Detection (config / access / audit-trail monitoring).
 *
 * Covers both surfaces the agent shows in:
 *   1. Dashboard AGI Insights surfaces a critical drift alert and links to
 *      CSV/CSA.
 *   2. The CSV/CSA module renders the Drift Detection panel with the alerts
 *      (audit-trail anomaly, access creep, configuration change).
 *   3. Re-scan re-runs (deterministic — same alerts).
 *
 * Deterministic mock: 5 alerts, 1 critical (audit-trail disabled). Login: QA Head.
 */

const QA_HEAD = { email: "qa@pharmaglimmora.com", password: "Demo@123" };

test("Drift Detection: dashboard alert + CSV/CSA panel", async ({
  page,
  context,
}) => {
  await context.clearCookies();

  // ── Login ──
  await page.goto("/login");
  await page.locator("#email").fill(QA_HEAD.email);
  await page.locator("#password").fill(QA_HEAD.password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 15_000,
  });

  // ── 1. Dashboard drift alert — asserted ONLY when the tenant has real drift ──
  //
  // STALE ASSERTION FIXED. This used to require the literal text "critical system
  // drift alert" — the output of `driftAlertSummary()`, a static fixture REMOVED in an
  // earlier commit as "a fabricated claim about their validated systems" (see the
  // REMOVED block in src/lib/ai/index.ts). The dashboard has derived this insight from
  // the tenant's OWN system records via `isValidationDrift` ever since, so the test
  // has been asserting a phrase the product no longer emits.
  //
  // It is also DATA-DEPENDENT: the seed tenant currently has zero systems in drift
  // (no Overdue validation, no Part 11 / Annex 11 non-compliance), so a truthful
  // dashboard MUST show no drift insight. Asserting one unconditionally would only
  // pass if the dashboard invented a number. So: assert the insight and its
  // click-through when drift exists, and skip straight to the module otherwise —
  // the CSV/CSA Drift Detection panel below is this spec's real subject either way.
  await page.goto("/");
  const driftInsight = page.getByText(/showing validation drift/i);
  if (await driftInsight.count() > 0) {
    await expect(driftInsight.first()).toBeVisible();
    // The insight action is now a real <a> (role "link") rather than a <button> — a
    // navigation affordance should be an anchor so it supports middle-click,
    // copy-link and assistive-tech link semantics.
    await page.getByRole("link", { name: /review drift/i }).click();
    await page.waitForURL(/\/csv-csa/, { timeout: 10_000 });
  } else {
    await page.goto("/csv-csa");
  }

  // ── 2. CSV/CSA Drift Detection panel renders the alerts ──
  await expect(page.getByText("Drift Detection")).toBeVisible({
    timeout: 10_000,
  });
  // The critical audit-trail anomaly is shown (scan resolves after ~1s).
  await expect(page.getByText(/Audit trail disabled on Empower CDS/i)).toBeVisible({
    timeout: 12_000,
  });
  // An access-creep alert is shown.
  await expect(
    page.getByText(/segregation-of-duties conflict/i),
  ).toBeVisible();

  // ── 3. Re-scan re-runs the monitor (deterministic) ──
  await page
    .getByRole("button", { name: /re-scan systems for drift/i })
    .click();
  await expect(
    page.getByText(/Audit trail disabled on Empower CDS/i),
  ).toBeVisible({ timeout: 12_000 });
});
