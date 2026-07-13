import { test, expect } from "@playwright/test";

/**
 * Regression test — FDA 483 "AI Draft" response generator.
 *
 * Bug: the AI Draft modal cleared its loading spinner only when
 * liveEvent.agiDraft changed VALUE from the snapshot taken at open time
 * (ResponseDetailTab diff-effect). But mockResponseDraft is fully
 * deterministic (no Date/random) — regenerating with the same observations
 * yields byte-identical text. So the SECOND time a user opened AI Draft
 * (once an agiDraft already existed), the value never changed and the
 * spinner spun forever; "Save & Apply" (hidden while loading) never showed.
 *
 * Fix: openAiModal awaits onGenerateAGIDraft() (which now returns the draft)
 * and clears the spinner unconditionally — independent of any value diff.
 *
 * This test opens AI Draft TWICE on the same event and asserts the editable
 * draft + Save & Apply appear BOTH times. Pre-fix, the second open times out.
 *
 * Target: seeded event WL-MUM-2026-001 (e3) — "Under Investigation" (not
 * terminal) with both observations carrying RCA + a linked CAPA, so Step 1
 * "Response draft" is in the unlocked "ready" state and the AI Draft button
 * renders. Requires `npm run db:seed`. Login: QA Head (qa@pharmaglimmora.com).
 */

const QA_HEAD = { email: "qa@pharmaglimmora.com", password: "Demo@123" };
const EVENT_REF = "WL-MUM-2026-001";

test("AI Draft generates on first AND repeat open (no infinite spinner)", async ({
  page,
  context,
}) => {
  await context.clearCookies();

  // ── Login as QA Head ──
  await page.goto("/login");
  await page.locator("#email").fill(QA_HEAD.email);
  await page.locator("#password").fill(QA_HEAD.password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 15_000,
  });

  // ── Open the fully-investigated event + its Response tab ──
  await page.goto("/fda-483");
  await page
    .getByRole("button", { name: new RegExp(`Open .*${EVENT_REF}`) })
    .click();
  await page.getByRole("tab", { name: "Response" }).click();

  const aiDraftButton = page.getByRole("button", { name: /ai draft/i });
  const editor = page.getByRole("textbox", {
    name: /AI-generated response draft/i,
  });
  const saveApply = page.getByRole("button", { name: /save & apply/i });

  // ── First open — spinner must resolve to the editable draft ──
  await aiDraftButton.click();
  await expect(editor).toBeVisible({ timeout: 12_000 });
  await expect(saveApply).toBeVisible();
  expect((await editor.inputValue()).length).toBeGreaterThan(0);

  // Close without applying — leaves an agiDraft persisted, so the next open
  // regenerates byte-identical text (the exact pre-fix hang condition).
  await page.getByRole("button", { name: /^cancel$/i }).click();
  await expect(editor).toBeHidden();

  // ── Second open — the regression assertion. Pre-fix: hangs here. ──
  await aiDraftButton.click();
  await expect(editor).toBeVisible({ timeout: 12_000 });
  await expect(saveApply).toBeVisible();
  expect((await editor.inputValue()).length).toBeGreaterThan(0);
});
