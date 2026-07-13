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

  // ── 1. Dashboard surfaces the critical drift alert ──
  await page.goto("/");
  await expect(
    page.getByText(/critical system drift alert/i),
  ).toBeVisible({ timeout: 10_000 });

  // Click through to CSV/CSA via the alert.
  await page.getByRole("button", { name: /review drift/i }).click();
  await page.waitForURL(/\/csv-csa/, { timeout: 10_000 });

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
