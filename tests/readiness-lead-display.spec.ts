import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";

/**
 * Training & Awareness (Inspection Readiness) → Overview: person fields must
 * render NAMES, never raw database ids.
 *
 * Regression guard for `Inspection.inspectionLead`, a free-text column with two
 * historical shapes — the seed writes a display name, the create form writes the
 * selected User.id — which the Overview card used to render verbatim, leaking a
 * cuid like `cmrufophb0019g27s5ay7yvex` into the UI.
 *
 * Covers the three contract branches of displayUserName():
 *   1. id that resolves in the tenant roster → that user's name
 *   2. id that resolves to a user in ANOTHER tenant → fallback, never the name
 *      (tenant isolation: the roster is tenant-scoped, so it must not resolve)
 *   3. unresolvable id → fallback, and never the raw id
 *
 * Cases 2 and 3 mutate `inspectionLead` and restore it in a finally block.
 */

const prisma = new PrismaClient();
const CUID_RE = /^c[a-z0-9]{20,}$/;

interface Fixture {
  inspectionId: string;
  inspectionTitle: string;
  originalLead: string | null;
  leadUserName: string;
  leadUserId: string;
  tenantId: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  /** A real User.id belonging to a DIFFERENT tenant, or null. */
  foreignUserId: string | null;
  foreignUserName: string | null;
}

let fx: Fixture;

test.beforeAll(async () => {
  // An inspection whose lead is stored as a raw User.id — the reported bug.
  const inspections = await prisma.inspection.findMany({
    select: { id: true, title: true, tenantId: true, inspectionLead: true },
  });
  const target = inspections.find((i) => i.inspectionLead && CUID_RE.test(i.inspectionLead));
  if (!target) test.skip(true, "No inspection stores its lead as a raw User.id.");

  const leadUser = await prisma.user.findFirst({
    where: { id: target!.inspectionLead!, tenantId: target!.tenantId },
    select: { id: true, name: true },
  });
  if (!leadUser) test.skip(true, "Lead id does not resolve to a user in the same tenant.");

  // Actor must be able to open the module (qa_head / customer_admin only).
  const actor = await prisma.user.findFirst({
    where: { tenantId: target!.tenantId, isActive: true, role: { in: ["qa_head", "customer_admin"] } },
    select: { id: true, name: true, email: true },
  });
  if (!actor) test.skip(true, "Tenant has no qa_head/customer_admin to view Readiness.");

  const foreign = await prisma.user.findFirst({
    where: { tenantId: { not: target!.tenantId }, isActive: true },
    select: { id: true, name: true },
  });

  fx = {
    inspectionId: target!.id,
    inspectionTitle: target!.title,
    originalLead: target!.inspectionLead,
    leadUserName: leadUser!.name,
    leadUserId: leadUser!.id,
    tenantId: target!.tenantId,
    actorId: actor!.id,
    actorName: actor!.name,
    actorEmail: actor!.email,
    foreignUserId: foreign?.id ?? null,
    foreignUserName: foreign?.name ?? null,
  };
});

test.afterAll(async () => {
  // Safety net — restore the real value even if a test crashed mid-mutation.
  if (fx) {
    await prisma.inspection.update({
      where: { id: fx.inspectionId },
      data: { inspectionLead: fx.originalLead },
    });
  }
  await prisma.$disconnect();
});

async function authenticate(context: BrowserContext) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET must be set to run this suite.");
  const token = await encode({
    secret,
    token: {
      name: fx.actorName,
      email: fx.actorEmail,
      sub: fx.actorId,
      id: fx.actorId,
      role: "qa_head",
      gxpSignatory: true,
      tenantId: fx.tenantId,
      orgId: fx.tenantId,
      siteId: null,
    },
  });
  await context.addCookies([
    { name: "next-auth.session-token", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
}

test.beforeEach(async ({ context }) => {
  await authenticate(context);
});

/** The value <p> that follows the "Lead" label <p> in the Inspection details card. */
function leadValue(page: Page) {
  return page.locator("p").filter({ hasText: /^Lead$/ }).locator("xpath=following-sibling::p").first();
}

/**
 * Open /readiness and select the fixture inspection — the Overview tab renders
 * "No inspection selected" until one is chosen from the header dropdown.
 */
async function openOverview(page: Page) {
  await page.goto("/readiness");
  await page.getByRole("button", { name: /select inspection/i }).click();
  await page.getByRole("option", { name: fx.inspectionTitle }).first().click();
  await expect(page.getByText("Inspection details")).toBeVisible();
}

test("Lead renders the user's name, not the raw id", async ({ page }) => {
  await openOverview(page);

  await expect(leadValue(page)).toHaveText(fx.leadUserName);

  // No raw id anywhere in the rendered Overview.
  const body = await page.locator("body").innerText();
  expect(body).not.toContain(fx.leadUserId);
});

test("an unresolvable lead id falls back to Unknown user and never shows the id", async ({ page }) => {
  const orphanId = "cxxxxxxxxxxxxxxxxxxxxxxxx"; // cuid-shaped, matches no user
  await prisma.inspection.update({
    where: { id: fx.inspectionId },
    data: { inspectionLead: orphanId },
  });
  try {
    await openOverview(page);
    await expect(leadValue(page)).toHaveText(/unknown user/i);
    const body = await page.locator("body").innerText();
    expect(body).not.toContain(orphanId);
  } finally {
    await prisma.inspection.update({
      where: { id: fx.inspectionId },
      data: { inspectionLead: fx.originalLead },
    });
  }
});

test("a lead id from another tenant does not resolve (tenant isolation)", async ({ page }) => {
  test.skip(!fx.foreignUserId, "Only one tenant has users in this database.");

  await prisma.inspection.update({
    where: { id: fx.inspectionId },
    data: { inspectionLead: fx.foreignUserId },
  });
  try {
    await openOverview(page);
    // Must NOT leak the other tenant's user name, and must not echo the id.
    await expect(leadValue(page)).toHaveText(/unknown user/i);
    const body = await page.locator("body").innerText();
    expect(body).not.toContain(fx.foreignUserId!);
    expect(body).not.toContain(fx.foreignUserName!);
  } finally {
    await prisma.inspection.update({
      where: { id: fx.inspectionId },
      data: { inspectionLead: fx.originalLead },
    });
  }
});

test("a legacy name-valued lead is preserved as-is", async ({ page }) => {
  await prisma.inspection.update({
    where: { id: fx.inspectionId },
    data: { inspectionLead: "Dr. Priya Sharma" },
  });
  try {
    await openOverview(page);
    await expect(leadValue(page)).toHaveText("Dr. Priya Sharma");
  } finally {
    await prisma.inspection.update({
      where: { id: fx.inspectionId },
      data: { inspectionLead: fx.originalLead },
    });
  }
});
