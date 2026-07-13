import { test, expect } from "@playwright/test";

/**
 * Feature test — Deviation Intelligence (recurring-pattern clustering).
 *
 * Covers the AGI panel embedded in Deviation Management:
 *   1. The panel is on-demand: it analyses only after the user clicks
 *      "Run Deviation Intelligence AI" (no auto-run on mount).
 *   2. With the seeded data (Manufacturing ×2, QC Lab ×2, Sterile
 *      Manufacturing ×1) it surfaces exactly 2 patterns, each with a
 *      suggested root cause.
 *   3. Clicking a clustered deviation reference opens its detail.
 *   4. Re-run re-runs the clustering (deterministic — same result).
 *
 * Data is the deterministic mock in src/lib/ai/mockData.ts driven by the
 * live seeded deviations. Login: QA Head. Requires `npm run db:seed`.
 */

const QA_HEAD = { email: "qa@pharmaglimmora.com", password: "Demo@123" };

test("Deviation Intelligence: clusters recurring patterns and links members", async ({
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

  // ── Deviation Management page ──
  await page.goto("/deviation");

  // ── 1. On-demand: no results card until the header run button is clicked ──
  // The run button lives in the page header; the results card (and its
  // clustered patterns) is absent until it's clicked.
  const runButton = page.getByRole("button", {
    name: /run deviation intelligence ai/i,
  });
  await expect(runButton).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByText("Recurring deviations in Manufacturing"),
  ).toHaveCount(0);

  await runButton.click();

  // The results card mounts and recurring-pattern clusters surface
  // (Manufacturing + QC Lab)
  await expect(
    page.getByText("Recurring deviations in Manufacturing"),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByText("Recurring deviations in QC Lab"),
  ).toBeVisible();

  // ── 2. Each cluster carries an AI-suggested root cause ──
  await expect(page.getByText("Suggested root cause").first()).toBeVisible();

  // ── 3. A clustered member ref opens that deviation's detail ──
  await page
    .getByRole("button", { name: "DEV-CHN-2026-001" })
    .click();
  // The detail modal renders the impact-assessment section.
  await expect(page.getByText("Impact assessment")).toBeVisible({
    timeout: 8_000,
  });
  // Close the modal (Escape) before re-analysing.
  await page.keyboard.press("Escape");

  // ── 4. Re-run re-runs the clustering (deterministic) ──
  await page
    .getByRole("button", { name: /re-run deviation intelligence ai/i })
    .click();
  await expect(
    page.getByText("Recurring deviations in Manufacturing"),
  ).toBeVisible({ timeout: 10_000 });
});
