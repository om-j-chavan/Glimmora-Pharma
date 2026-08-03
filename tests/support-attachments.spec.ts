import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Feature test — Support ticket attachments.
 *
 * Walks the whole flow the feature was built for:
 *   Raise ticket → attach documents → save → open the ticket → verify the
 *   attachments → add another from the detail page → remove one → reload and
 *   confirm what persisted.
 *
 * Everything under test is COMPOSED from existing pieces — the shared
 * <DocumentUpload> picker, uploadDocuments(), <DocumentCard>, deleteDocument()
 * and usePermissions("evidence") — so these assertions also guard the shared
 * components against regressions from their other consumers.
 *
 * Also pins the PERMISSION mirror, which is the easiest thing to break here:
 * adding an attachment needs createDocument's author role set, so a requester
 * outside it (operations_head) must get a read-only panel with an explanation
 * rather than an upload control that always fails server-side.
 *
 * This spec CREATES tickets (there is no other way to exercise the flow) but
 * touches no seeded record, so it cannot perturb the other suites.
 *
 * Requires `npm run db:seed`.
 */

const PASSWORD = "Demo@123";
/** qa_head — in COMPLIANCE_AUTHOR_ROLES *and* DOCUMENT_APPROVE_ROLES: may add AND remove. */
const AUTHOR = "qa@pharmaglimmora.com";
/** operations_head — outside COMPLIANCE_AUTHOR_ROLES: read-only attachments. */
const NON_AUTHOR = "ops@pharmaglimmora.com";

function tempFile(name: string, body: string): string {
  const p = path.join(os.tmpdir(), name);
  fs.writeFileSync(p, body);
  return p;
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15_000 });
}

/** Raise a ticket, optionally attaching files, and open its detail page. */
async function raiseTicket(page: Page, subject: string, files: string[] = []) {
  await page.goto("/support");
  await page.getByRole("button", { name: /raise ticket/i }).first().click();
  const dlg = page.getByRole("dialog").last();
  await dlg.locator("#t-subject").fill(subject);
  await dlg.locator("#t-desc").fill("Automated verification of the support attachment flow.");
  if (files.length > 0) await dlg.locator('input[type="file"]').first().setInputFiles(files);
  await dlg.getByRole("button", { name: /^create$/i }).click();
  // WAIT for the success toast before navigating. The modal creates the ticket,
  // then uploads each attachment against the returned id; navigating early
  // aborts those in-flight uploads and the ticket lands with no attachments.
  await expect(page.getByText(/raised\./i)).toBeVisible({ timeout: 30_000 });
  // Land on the queue, then open the new ticket by subject.
  await page.goto("/support");
  await expect(page.getByText(subject).first()).toBeVisible({ timeout: 15_000 });
  await page.getByText(subject).first().click();
  await expect(page.getByRole("button", { name: /back to/i })).toBeVisible({ timeout: 15_000 });
}

test("Support: attach on create, then add, download and remove from the ticket", async ({ page, context }) => {
  await context.clearCookies();
  await login(page, AUTHOR);

  const log = tempFile("support-log.txt", "application log excerpt");
  const png = tempFile("support-screenshot.png", "\x89PNG fake bytes");

  /* ── 1. The picker validates before anything is created ── */
  await page.goto("/support");
  await page.getByRole("button", { name: /raise ticket/i }).first().click();
  const dlg = page.getByRole("dialog").last();
  await expect(dlg.getByText(/Drag & drop files here, or click to browse/i)).toBeVisible();

  const input = dlg.locator('input[type="file"]').first();
  await input.setInputFiles(tempFile("support-bad.exe", "nope"));
  await expect(page.getByText(/support-bad\.exe isn't a supported file type/i)).toBeVisible();

  await input.setInputFiles([log, png]);
  await expect(dlg.getByText("support-log.txt")).toBeVisible();
  await expect(dlg.getByText("support-screenshot.png")).toBeVisible();
  // Re-picking the same file is reported, not silently swallowed.
  await input.setInputFiles(log);
  await expect(page.getByText(/support-log\.txt has already been added/i)).toBeVisible();
  // Staged files can be dropped before the ticket exists.
  await dlg.getByRole("button", { name: /Remove support-screenshot\.png/i }).click();
  await expect(dlg.getByText("support-screenshot.png")).toHaveCount(0);
  await dlg.getByRole("button", { name: /^cancel$/i }).click();

  /* ── 2. Create WITH attachments, and verify they persisted against the ticket ── */
  const subject = `E2E support attachments ${Date.now()}`;
  await raiseTicket(page, subject, [log, png]);

  await expect(page.getByText(/^Attachments \(2\)$/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("support-log.txt", { exact: true })).toBeVisible();
  // Name + type + size + uploader are all on the card.
  await expect(page.getByText(/TXT · 23 B · /)).toBeVisible();
  await expect(page.getByRole("link", { name: /Download support-log\.txt/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /View support-log\.txt/i })).toBeVisible();

  /* ── 3. Add another from the detail page ── */
  const csv = tempFile("support-extra.csv", "col1,col2\n1,2\n");
  await page.locator('input[type="file"]').first().setInputFiles(csv);
  await page.getByRole("button", { name: /upload 1 file/i }).click();
  await expect(page.getByText(/^Attachments \(3\)$/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("support-extra.csv", { exact: true })).toBeVisible();

  /* ── 4. Removal is confirmed, then applied ── */
  await page.getByRole("button", { name: /Remove support-extra\.csv/i }).click();
  await expect(page.getByText(/Remove this attachment\?/i)).toBeVisible();
  await page.getByRole("button", { name: /^keep$/i }).click();
  await expect(page.getByText("support-extra.csv", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Remove support-extra\.csv/i }).click();
  await page.getByRole("button", { name: /^remove$/i }).click();
  await expect(page.getByText(/^Attachments \(2\)$/)).toBeVisible({ timeout: 20_000 });

  /* ── 5. Persistence survives a reload (not just an optimistic UI) ── */
  await page.reload();
  await expect(page.getByText(/^Attachments \(2\)$/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("support-log.txt", { exact: true })).toBeVisible();
  await expect(page.getByText("support-extra.csv", { exact: true })).toHaveCount(0);
});

test("Support: a requester outside the document-author roles gets a read-only panel", async ({ page, context }) => {
  await context.clearCookies();
  await login(page, NON_AUTHOR);

  await raiseTicket(page, `E2E support perms ${Date.now()}`);

  // Empty state is a real state, not a hidden section.
  await expect(page.getByText(/No documents attached yet/i)).toBeVisible({ timeout: 15_000 });
  // No upload control — createDocument would reject this role, so rendering one
  // would be a button that always fails.
  await expect(page.getByText(/Drag & drop files here/i)).toHaveCount(0);
  await expect(page.getByText(/can view and download attachments, but not add them/i)).toBeVisible();
});
