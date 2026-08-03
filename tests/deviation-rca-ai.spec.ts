import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Feature test — Deviation module: shared staged upload + RCA Intelligence.
 *
 * Two halves, both on seeded data:
 *
 *   1. ADD MODAL — the Add Deviation form now uses the SAME
 *      <StagedDocumentUpload> as the Gap Assessment "Report Compliance Gap"
 *      modal: drag/drop zone, supported-type validation, a "Pending upload"
 *      preview card, and confirmed removal. The severity dropdown renders the
 *      shared taxonomy-coloured option pills (FDA: Critical / Major / Minor).
 *
 *   2. RCA INTELLIGENCE — the AI assist in the Investigation section:
 *      run → review → apply, including the overwrite pre-flight that protects
 *      an investigator's existing analysis, and the provenance banner proving
 *      the RCA form was AI-seeded rather than typed.
 *
 * Deliberately NON-MUTATING: the add modal is filled and abandoned, and the AI
 * draft is applied to the RCA form but never saved. Nothing is written, so this
 * spec cannot perturb the seeded register that deviation-intelligence.spec.ts
 * asserts cluster counts against.
 *
 * The AI call goes through the real gateway: live analysis when the FastAPI
 * agent is up, the deterministic mock when it is not. Both render the same
 * shape, so the assertions below hold either way.
 *
 * Login: QA Head. Requires `npm run db:seed`.
 */

const QA_HEAD = { email: "qa@pharmaglimmora.com", password: "Demo@123" };

/** Seeded deviation that is Under Investigation WITH a saved Fishbone RCA —
 *  which is what makes it the right fixture for the overwrite pre-flight. */
const SEEDED_REF = "DEV-CHN-2026-003";

function tempFile(name: string, body: string): string {
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, body);
  return p;
}

test.beforeEach(async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/login");
  await page.locator("#email").fill(QA_HEAD.email);
  await page.locator("#password").fill(QA_HEAD.password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15_000 });
  await page.goto("/deviation");
});

test("Add Deviation: shared staged upload validates, previews and confirms removal", async ({ page }) => {
  await page.getByRole("button", { name: /report deviation/i }).first().click();
  const dlg = page.getByRole("dialog").last();
  await expect(dlg.getByText("Drag & drop files here")).toBeVisible({ timeout: 10_000 });
  await expect(dlg.getByText(/Supported: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, TXT · Max 25 MB/)).toBeVisible();

  const input = dlg.locator('input[type="file"]').first();

  // ── Unsupported type is rejected, with the reason shown ──
  await input.setInputFiles(tempFile("e2e-bad.exe", "not a document"));
  await expect(dlg.getByText(/e2e-bad\.exe — unsupported file type/i)).toBeVisible();
  await expect(dlg.getByText("Pending upload")).toHaveCount(0);

  // ── Supported type is staged with a preview card ──
  // Written ONCE and re-picked from the same path below: staging identity is
  // name+size+mtime, so re-writing the file would legitimately read as a new
  // file and defeat the duplicate check.
  const evidence = tempFile("e2e-evidence.txt", "IPC log extract");
  await input.setInputFiles(evidence);
  await expect(dlg.getByText("e2e-evidence.txt", { exact: true })).toBeVisible();
  await expect(dlg.getByText("Pending upload")).toBeVisible();

  // ── Re-picking the same file is refused, not silently duplicated ──
  await input.setInputFiles(evidence);
  await expect(dlg.getByText(/e2e-evidence\.txt — already added/i)).toBeVisible();

  // ── Removal is confirmed, and "Keep" keeps it ──
  await dlg.getByRole("button", { name: /remove e2e-evidence\.txt/i }).click();
  await expect(page.getByText("Remove this document?")).toBeVisible();
  await page.getByRole("button", { name: /^keep$/i }).click();
  await expect(dlg.getByText("e2e-evidence.txt", { exact: true })).toBeVisible();

  // ── …and "Remove" removes it ──
  await dlg.getByRole("button", { name: /remove e2e-evidence\.txt/i }).click();
  await page.getByRole("button", { name: /^remove$/i }).click();
  await expect(dlg.getByText("Pending upload")).toHaveCount(0);

  // ── Severity: FDA taxonomy with the shared colour-coded option pills ──
  await dlg.getByRole("button", { name: /^Major$/ }).first().click();
  await expect(page.getByRole("option", { name: /Critical/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Major/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Minor/ })).toBeVisible();
  // Generic-taxonomy values belong to Gap findings, never to a deviation.
  await expect(page.getByRole("option", { name: /^High$/ })).toHaveCount(0);
});

test("Deviation RCA Intelligence: analyse, review, and apply into the RCA form", async ({ page }) => {
  await page.getByText(SEEDED_REF).first().click();
  const detail = page.getByRole("dialog").last();

  // ── The AI trigger lives in the Investigation (RCA) section ──
  const aiTrigger = detail.getByRole("button", { name: /analyse this deviation with ai/i });
  await expect(aiTrigger).toBeVisible({ timeout: 10_000 });
  await aiTrigger.click();

  const ai = page.getByRole("dialog").last();
  await expect(ai.getByText(`${SEEDED_REF} ·`)).toBeVisible();

  // ── Result: provenance badge + every analysis section ──
  // Generous timeout — this is a live LLM round-trip when the agent is up.
  await expect(ai.getByText(/AI draft RCA/i)).toBeVisible({ timeout: 90_000 });
  await expect(ai.locator(".ai-badge").first()).toBeVisible();
  await expect(ai.getByText("PROBABLE ROOT CAUSES")).toBeVisible();
  await expect(ai.getByText("MISSING INFORMATION & EVIDENCE")).toBeVisible();
  await expect(
    ai.getByText(/AI-generated and advisory. The recorded RCA remains your professional judgment./i),
  ).toBeVisible();

  // ── The draft is EDITABLE before it is applied ──
  const draftField = ai.locator("textarea").first();
  await expect(draftField).toBeEditable();

  // ── Apply hits the overwrite pre-flight (this deviation has a saved RCA) ──
  await ai.getByRole("button", { name: /apply to rca/i }).click();
  await expect(page.getByText("Replace your current analysis?")).toBeVisible();
  await page.getByRole("button", { name: /^replace$/i }).click();

  // ── The RCA form opens, seeded, flagged as AI-drafted, and unsaved ──
  const rca = page.getByRole("dialog").last();
  await expect(rca.getByText(/pre-filled from an AI draft/i)).toBeVisible({ timeout: 10_000 });
  await expect(rca.locator("textarea").first()).not.toHaveValue("");
  await expect(rca.getByRole("button", { name: /save rca/i })).toBeEnabled();

  // Abandon without saving — this spec must not mutate the seeded register.
  await rca.getByRole("button", { name: /^cancel$/i }).click();
  await page.getByRole("button", { name: /^discard$/i }).click();
});
