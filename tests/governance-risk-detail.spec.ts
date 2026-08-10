import { test, expect, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";

/**
 * Risk Register → risk detail route regression suite.
 *
 * Guards the /governance/risks/[id] flow end to end:
 *   1. the register lists the risk,
 *   2. clicking it navigates to /governance/risks/<id> and the detail renders,
 *   3. an id that does not exist renders the Not Found state (not a blank page),
 *   4. a risk belonging to ANOTHER tenant is indistinguishable from missing —
 *      the IDOR guard in getRisk()/riskVisibilityWhere().
 *
 * (3) is the regression this suite was written for: without a not-found
 * boundary inside the (app) route group, `notFound()` resolved to the ROOT
 * app/not-found.tsx, which lives outside this group's layout and cannot be
 * composed into the already-rendered AppShell — the throw produced an empty
 * content area. See app/(app)/not-found.tsx.
 *
 * Auth: rather than driving the login form (these tenant users are created
 * through the UI, so their passwords aren't known to the suite), we mint the
 * same NextAuth JWT the Credentials provider would issue and set it as the
 * session cookie. The JWT callback's only extra requirement is that
 * `iat >= tenant.sessionsValidAfter`, which a freshly minted token satisfies.
 */

const prisma = new PrismaClient();

interface Fixture {
  riskId: string;
  riskTitle: string;
  tenantId: string;
  userId: string;
  userName: string;
  userEmail: string;
  /** A real risk id from a DIFFERENT tenant, or null if the DB has only one. */
  foreignRiskId: string | null;
}

let fx: Fixture;

test.beforeAll(async () => {
  // Pick a risk whose owner is a qa_head in the same tenant — qa_head is one of
  // GOVERNANCE_VIEW_ROLES and a see-all role, so visibility is not the variable
  // under test here (test 4 covers the deny path).
  const risk = await prisma.risk.findFirst({
    where: { deletedAt: null, ownerId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, tenantId: true, ownerId: true },
  });
  if (!risk) test.skip(true, "No risks in the dev database — seed one first.");

  const owner = await prisma.user.findFirst({
    where: { id: risk!.ownerId!, isActive: true },
    select: { id: true, name: true, email: true, role: true, tenantId: true },
  });
  if (!owner) test.skip(true, `Risk ${risk!.id} has no active owner user.`);
  if (owner!.role !== "qa_head" && owner!.role !== "customer_admin") {
    test.skip(true, `Risk owner role ${owner!.role} cannot open Governance.`);
  }

  const foreign = await prisma.risk.findFirst({
    where: { deletedAt: null, tenantId: { not: risk!.tenantId } },
    select: { id: true },
  });

  fx = {
    riskId: risk!.id,
    riskTitle: risk!.title,
    tenantId: risk!.tenantId,
    userId: owner!.id,
    userName: owner!.name,
    userEmail: owner!.email,
    foreignRiskId: foreign?.id ?? null,
  };
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

/** Seed the browser context with a valid NextAuth session cookie. */
async function authenticate(context: BrowserContext) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET must be set to run this suite.");

  const token = await encode({
    secret,
    token: {
      name: fx.userName,
      email: fx.userEmail,
      sub: fx.userId,
      id: fx.userId,
      role: "qa_head",
      gxpSignatory: true,
      tenantId: fx.tenantId,
      orgId: fx.tenantId,
      siteId: null,
    },
  });

  await context.addCookies([
    {
      name: "next-auth.session-token",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

test.beforeEach(async ({ context }) => {
  await authenticate(context);
});

test("risk register lists the risk and navigates to its detail page", async ({ page }) => {
  await page.goto("/governance");

  const row = page.getByRole("row").filter({ hasText: fx.riskTitle }).first();
  await expect(row).toBeVisible();

  await row.click();

  await expect(page).toHaveURL(new RegExp(`/governance/risks/${fx.riskId}$`));
  // The detail actually rendered — not a shell, not the not-found state.
  await expect(page.getByText(fx.riskTitle).first()).toBeVisible();
  await expect(page.getByText("Record not found")).toHaveCount(0);
});

test("risk detail loads on direct navigation", async ({ page }) => {
  await page.goto(`/governance/risks/${fx.riskId}`);

  await expect(page.getByText(fx.riskTitle).first()).toBeVisible();
  await expect(page.getByText("Record not found")).toHaveCount(0);
});

test("a non-existent risk id renders the Not Found state, not a blank page", async ({ page }) => {
  await page.goto("/governance/risks/definitely-not-a-real-risk-id");

  await expect(page.getByText("Record not found")).toBeVisible();
  await expect(page.getByRole("link", { name: /back to dashboard/i })).toBeVisible();
});

test("a risk from another tenant is not found (IDOR guard)", async ({ page }) => {
  test.skip(!fx.foreignRiskId, "Dev database has risks in only one tenant.");

  await page.goto(`/governance/risks/${fx.foreignRiskId}`);

  await expect(page.getByText("Record not found")).toBeVisible();
});
