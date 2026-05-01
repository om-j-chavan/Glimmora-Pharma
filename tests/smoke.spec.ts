import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * Minimal smoke suite — the honest baseline.
 *
 * Covers four critical paths:
 *   1. Login page renders.
 *   2. Super admin sign-in works and lands on /admin.
 *   3. Logged-out access to /capa redirects to /login with callbackUrl
 *      (proves proxy.ts auth gate runs).
 *   4. Customer admin sign-in (non-MFA tenant) lands on /.
 *   5. MFA-enabled tenant opens the OTP modal on submit.
 *      (We do NOT submit a real OTP — reading the code requires test infra
 *      we don't have yet. Deferred.)
 *   6. Super admin bypasses MFA even when their own tenant row has
 *      mfaEnabled=true.
 *
 * Test isolation: a dedicated MFA tenant is created in beforeAll and deleted
 * in afterAll. afterEach restores super_admin's mfaEnabled to false as a
 * safety net in case test 6 crashes mid-toggle.
 */

const prisma = new PrismaClient();

const SEED = {
  superAdmin: { email: "superadmin@glimmora.com", password: "1" },
  customerAdmin: { email: "admin@pharmaglimmora.com", password: "Admin@123" },
};

const MFA_TEST_TENANT = {
  customerCode: "MFA_TEST_001",
  name: "MFA Test Co",
  username: "mfa-test-admin",
  email: "mfa-test-admin@glimmora-test.local",
  password: "MfaTest@123",
};

let mfaTestTenantId: string | null = null;

test.beforeAll(async () => {
  // Clean any prior run that crashed mid-suite.
  await prisma.tenant.deleteMany({ where: { email: MFA_TEST_TENANT.email } });

  // Create the dedicated MFA-enabled tenant with an active subscription.
  // The subscription gate runs before the MFA check, so without it the login
  // would fail with SUBSCRIPTION_INACTIVE before the OTP modal could open.
  const passwordHash = await bcrypt.hash(MFA_TEST_TENANT.password, 10);
  const created = await prisma.tenant.create({
    data: {
      customerCode: MFA_TEST_TENANT.customerCode,
      name: MFA_TEST_TENANT.name,
      username: MFA_TEST_TENANT.username,
      email: MFA_TEST_TENANT.email,
      passwordHash,
      role: "customer_admin",
      mfaEnabled: true,
      isActive: true,
      subscription: {
        create: {
          maxAccounts: 5,
          startDate: new Date(),
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          status: "Active",
        },
      },
    },
  });
  mfaTestTenantId = created.id;
});

test.afterAll(async () => {
  if (mfaTestTenantId) {
    await prisma.tenant.delete({ where: { id: mfaTestTenantId } }).catch(() => {});
  }
  // Safety net: ensure super_admin tenant's mfaEnabled is false in case
  // test 6 mutated it and crashed before its own teardown.
  await prisma.tenant.updateMany({
    where: { email: SEED.superAdmin.email },
    data: { mfaEnabled: false },
  });
  await prisma.$disconnect();
});

test.afterEach(async () => {
  // Belt-and-braces. Cheaper than a flake at 2am.
  await prisma.tenant.updateMany({
    where: { email: SEED.superAdmin.email },
    data: { mfaEnabled: false },
  });
});

test.describe("Login + auth surface — smoke", () => {
  test("1. /login renders with email, password, and sign-in button", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/login");
    await expect(page.getByLabel("Work email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("2. Super admin sign-in lands on /admin", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/login");
    await page.getByLabel("Work email").fill(SEED.superAdmin.email);
    await page.locator("#password").fill(SEED.superAdmin.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((u) => u.pathname.startsWith("/admin"), { timeout: 15_000 });
  });

  test("3. Logged-out access to /capa redirects to /login with callbackUrl", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/capa");
    await page.waitForURL(/\/login\?callbackUrl=/i, { timeout: 10_000 });
    expect(decodeURIComponent(page.url())).toContain("callbackUrl=/capa");
  });

  test("4. Customer admin (non-MFA tenant) sign-in lands on /", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/login");
    await page.getByLabel("Work email").fill(SEED.customerAdmin.email);
    await page.locator("#password").fill(SEED.customerAdmin.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL((u) => u.pathname === "/", { timeout: 15_000 });
  });

  test("5. MFA-enabled tenant opens OTP modal on sign-in", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/login");
    await page.getByLabel("Work email").fill(MFA_TEST_TENANT.email);
    await page.locator("#password").fill(MFA_TEST_TENANT.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    // The OTP modal is the shared <Modal>, title "Enter verification code".
    await expect(
      page.getByRole("dialog", { name: /enter verification code/i }),
    ).toBeVisible({ timeout: 15_000 });
    // The 6-digit input is inside the modal — selector pinned to its id.
    await expect(page.locator("#otp-input")).toBeVisible();
    // We deliberately do NOT submit a code — see file header.
  });

  test("6. Super admin bypasses MFA even when own tenant has mfaEnabled=true", async ({ page, context }) => {
    await context.clearCookies();
    // Toggle the super_admin tenant on. afterEach restores.
    await prisma.tenant.updateMany({
      where: { email: SEED.superAdmin.email },
      data: { mfaEnabled: true },
    });

    await page.goto("/login");
    await page.getByLabel("Work email").fill(SEED.superAdmin.email);
    await page.locator("#password").fill(SEED.superAdmin.password);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Lands on /admin directly — no OTP modal.
    await page.waitForURL((u) => u.pathname.startsWith("/admin"), { timeout: 15_000 });
    await expect(
      page.getByRole("dialog", { name: /enter verification code/i }),
    ).not.toBeVisible();
  });
});
