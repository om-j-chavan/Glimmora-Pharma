import { test, expect } from "@playwright/test";

/**
 * Feature test — Regulatory Intelligence (FDA/EMA guidance monitoring).
 *
 * Covers the full surface of the new AGI feature:
 *   1. Dashboard "AGI Insights" surfaces the regulatory change alert
 *      (independent of whether findings/CAPA Redux is hydrated) and links
 *      to the module.
 *   2. The module page runs the mock-AI scan and renders guidance updates
 *      with impact / change-type / new-requirement flags + suggested
 *      alignment.
 *   3. "Mark reviewed" acknowledges an update.
 *   4. "Scan for updates" re-runs the scan (deterministic — same list).
 *
 * Data is the deterministic mock in src/lib/ai/mockData.ts (2 new
 * requirements, 3 high-impact, 6 updates total). Login: QA Head.
 */

const QA_HEAD = { email: "qa@pharmaglimmora.com", password: "Demo@123" };
const FDA_CSA_TITLE =
  "Computer Software Assurance for Production and Quality System Software";

test("Regulatory Intelligence: dashboard alert → module → scan → acknowledge", async ({
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

  // ── 1. Dashboard surfaces the regulatory change alert ──
  await page.goto("/");
  const dashAlert = page.getByText(
    /new FDA\/EMA regulatory requirement/i,
  );
  await expect(dashAlert).toBeVisible({ timeout: 10_000 });

  // Click through to the module via the alert's action link.
  await page.getByRole("button", { name: /review guidance/i }).click();
  await page.waitForURL(/\/regulatory-intelligence/, { timeout: 10_000 });

  // ── 2. Module page renders the scanned guidance updates ──
  await expect(
    page.getByRole("heading", { name: "Regulatory Intelligence" }),
  ).toBeVisible();
  // Scan resolves to the deterministic list — the high-impact FDA CSA update
  // sorts first.
  await expect(page.getByText(FDA_CSA_TITLE)).toBeVisible({ timeout: 12_000 });
  // The "New requirements" stat reflects the 2 flagged updates.
  await expect(
    page.getByRole("region", { name: "New requirements" }).getByText("2", {
      exact: true,
    }),
  ).toBeVisible();
  // At least one "New requirement" flag badge is shown.
  await expect(page.getByText("New requirement").first()).toBeVisible();
  // Suggested-alignment guidance is present.
  await expect(page.getByText("Suggested alignment").first()).toBeVisible();

  // ── 3. Acknowledge an update ──
  await page
    .getByRole("button", { name: /mark .* reviewed/i })
    .first()
    .click();
  await expect(page.getByText("Reviewed").first()).toBeVisible();

  // ── 4. Re-scan (deterministic — list returns unchanged) ──
  await page.getByRole("button", { name: /scan agency feeds/i }).click();
  await expect(page.getByText(FDA_CSA_TITLE)).toBeVisible({ timeout: 12_000 });
});
