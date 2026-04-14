import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

type ErrorRecord = { type: "console" | "pageerror" | "failed-request"; text: string };

function attachErrorCollectors(page: Page): ErrorRecord[] {
  const errors: ErrorRecord[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Ignore React devtools prompt + favicon 404s.
      if (/React DevTools|favicon/i.test(text)) return;
      // Pre-existing dev-only artifact: React 19 StrictMode double-invokes
      // effects, which aborts the admin shell's tenant-sync fetch on the
      // first mount. The same behavior existed under Vite dev.
      if (/\[admin\] tenant sync failed/i.test(text)) return;
      errors.push({ type: "console", text });
    }
  });
  page.on("pageerror", (err) => {
    errors.push({ type: "pageerror", text: err.message });
  });
  page.on("requestfailed", (req) => {
    const url = req.url();
    if (/favicon|_next\/static/.test(url)) return;
    const failure = req.failure()?.errorText ?? "";
    // net::ERR_ABORTED is what Chrome reports when a fetch is cancelled
    // by React 19 StrictMode's dev-only double-invoke effect cleanup.
    // Not a real failure; the retried fetch on the second mount succeeds.
    if (failure.includes("ERR_ABORTED")) return;
    errors.push({ type: "failed-request", text: `${req.method()} ${url} — ${failure}` });
  });
  return errors;
}

/**
 * Logs in as QA Head (non-super-admin) through the real UI:
 * /login → fill form → sign in → site picker → continue → /
 */
async function loginAsQaHead(page: Page): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Work email").fill("qa@pharmaglimmora.com");
  await page.locator("#password").fill("QaHead@123");
  await page.getByRole("button", { name: /sign in/i }).click();

  // Inline site picker appears
  await expect(page.getByRole("region", { name: /select your site/i })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("option").first().click();
  await page.getByRole("button", { name: /continue/i }).click();

  // Lands on dashboard "/"
  await page.waitForURL((url) => url.pathname === "/", { timeout: 10_000 });
  await expect(page.locator("main#main-content").first()).toBeVisible();
}

/**
 * Logs in as platform super admin — goes directly to /admin, skipping site picker.
 */
async function loginAsSuperAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Work email").fill("admin@pharmaglimmora.com");
  await page.locator("#password").fill("Admin@123");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/admin"), { timeout: 10_000 });
}

// ──────────────────────────────────────────────────────────────────────
// Suite A — unauthenticated / shell / theme
// ──────────────────────────────────────────────────────────────────────

test.describe("A. shell + theme (unauthenticated)", () => {
  test("A1. / without a session redirects to /login and renders the form", async ({ page }) => {
    const errors = attachErrorCollectors(page);
    await page.goto("/");
    await page.waitForURL(/\/login$/, { timeout: 10_000 });
    await expect(page.getByLabel("Work email")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    expect(errors, `Errors:\n${errors.map((e) => `[${e.type}] ${e.text}`).join("\n")}`).toHaveLength(0);
  });

  test("A2. default theme attributes are applied pre-hydration", async ({ page }) => {
    await page.goto("/login");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "light");
    await expect(html).toHaveAttribute("data-color-theme", "coffee-brown");
  });

  test("A3. theme persists across reload (dark mode)", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => localStorage.setItem("glimmora-theme", "dark"));
    await page.reload();
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "dark");
    // Reset for subsequent tests
    await page.evaluate(() => localStorage.setItem("glimmora-theme", "light"));
  });

  test("A4. color-theme persists across reload", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => localStorage.setItem("glimmora-color-theme", "emerald"));
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-color-theme", "emerald");
    await page.evaluate(() => localStorage.setItem("glimmora-color-theme", "coffee-brown"));
  });
});

// ──────────────────────────────────────────────────────────────────────
// Suite B — login flow
// ──────────────────────────────────────────────────────────────────────

test.describe("B. login flow", () => {
  test("B1. QA Head login → site picker → dashboard", async ({ page }) => {
    const errors = attachErrorCollectors(page);
    await loginAsQaHead(page);
    expect(errors, `Errors:\n${errors.map((e) => `[${e.type}] ${e.text}`).join("\n")}`).toHaveLength(0);
  });

  test("B2. Super admin login → /admin", async ({ page }) => {
    const errors = attachErrorCollectors(page);
    await loginAsSuperAdmin(page);
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator("main, [role='main']").first()).toBeVisible();
    expect(errors, `Errors:\n${errors.map((e) => `[${e.type}] ${e.text}`).join("\n")}`).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Suite C — authenticated navigation
// ──────────────────────────────────────────────────────────────────────

test.describe("C. authenticated navigation (QA Head)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsQaHead(page);
  });

  test("C1. sidebar + main content render after login", async ({ page }) => {
    await expect(page.locator("main#main-content").first()).toBeVisible();
    await expect(page.getByRole("navigation", { name: /main navigation/i })).toBeVisible();
  });

  test("C2. navigate to /gap-assessment", async ({ page }) => {
    const errors = attachErrorCollectors(page);
    await page.goto("/gap-assessment");
    await expect(page.locator("main#main-content").first()).toBeVisible();
    expect(errors, `Errors:\n${errors.map((e) => `[${e.type}] ${e.text}`).join("\n")}`).toHaveLength(0);
  });

  test("C3. navigate to /capa", async ({ page }) => {
    const errors = attachErrorCollectors(page);
    await page.goto("/capa");
    await expect(page.locator("main#main-content").first()).toBeVisible();
    expect(errors, `Errors:\n${errors.map((e) => `[${e.type}] ${e.text}`).join("\n")}`).toHaveLength(0);
  });

  test("C4. dynamic route /capa/:id renders", async ({ page }) => {
    const errors = attachErrorCollectors(page);
    await page.goto("/capa/test-capa-id");
    await expect(page.locator("main#main-content").first()).toBeVisible();
    expect(errors, `Errors:\n${errors.map((e) => `[${e.type}] ${e.text}`).join("\n")}`).toHaveLength(0);
  });

  test("C5. navigate to /evidence, /governance, /fda-483, /csv-csa", async ({ page }) => {
    const errors = attachErrorCollectors(page);
    for (const path of ["/evidence", "/governance", "/fda-483", "/csv-csa"]) {
      await page.goto(path);
      await expect(page.locator("main#main-content").first()).toBeVisible();
    }
    expect(errors, `Errors:\n${errors.map((e) => `[${e.type}] ${e.text}`).join("\n")}`).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Suite D — admin
// ──────────────────────────────────────────────────────────────────────

test.describe("D. admin routes (super admin)", () => {
  test("D1. /admin shell renders", async ({ page }) => {
    const errors = attachErrorCollectors(page);
    await loginAsSuperAdmin(page);
    await page.goto("/admin");
    // AdminShell has an Outlet that mounts CustomerAccountsPage at index
    await expect(page.locator("body")).toBeVisible();
    expect(errors, `Errors:\n${errors.map((e) => `[${e.type}] ${e.text}`).join("\n")}`).toHaveLength(0);
  });

  test("D2. /admin/customer/:id renders", async ({ page }) => {
    const errors = attachErrorCollectors(page);
    await loginAsSuperAdmin(page);
    await page.goto("/admin/customer/tenant-abc");
    await expect(page.locator("body")).toBeVisible();
    expect(errors, `Errors:\n${errors.map((e) => `[${e.type}] ${e.text}`).join("\n")}`).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Suite E — API shims
// ──────────────────────────────────────────────────────────────────────

test.describe("E. api re-export shims", () => {
  test("E1. /api/debug-env returns 200 JSON via Next.js shim", async ({ request }) => {
    const res = await request.get("/api/debug-env");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("databaseUrlSet");
  });
});

// ──────────────────────────────────────────────────────────────────────
// Suite F — auth failure + persistence
// ──────────────────────────────────────────────────────────────────────

test.describe("F. auth failure + persistence", () => {
  test("F1. forced logout via dispatch redirects to /login", async ({ page }) => {
    await loginAsQaHead(page);
    // Clear token via localStorage and navigate — the siteLoader should redirect.
    await page.evaluate(() => {
      const raw = localStorage.getItem("glimmora-state");
      if (!raw) return;
      const s = JSON.parse(raw);
      s.auth.token = null;
      s.auth.user = null;
      localStorage.setItem("glimmora-state", JSON.stringify(s));
    });
    await page.goto("/gap-assessment");
    await page.waitForURL(/\/login$/, { timeout: 10_000 });
    await expect(page.getByLabel("Work email")).toBeVisible();
  });

  test("F2. session persists across reload", async ({ page }) => {
    await loginAsQaHead(page);
    await page.reload();
    // Should still be on the dashboard with the shell rendered
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("main#main-content").first()).toBeVisible();
  });
});
