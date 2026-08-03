import { test, expect, type Page } from "@playwright/test";

/**
 * MULTIPLE REGULATORY REGIONS — end-to-end.
 *
 * A tenant holds a SET of regions (TenantRegulatoryRegion), not one column, so
 * the properties worth proving here are the ones a type-check can't reach: that
 * the Super Admin can pick several, that the set survives a reload (i.e. it
 * really persisted rather than living in Redux), that re-opening the editor shows
 * the existing selection back, and that the Customer Admin sees every assigned
 * region with no way to change it.
 *
 * The three tests form ONE chain — the Super Admin assigns regions to the demo
 * tenant, then the demo tenant's own admin reads them back. `playwright.config`
 * pins `workers: 1, fullyParallel: false`, so they run in file order.
 */

const SUPER_ADMIN = { email: "superadmin@glimmora.com", password: "1" };
/** The demo tenant, which is also the FIRST row of the accounts table. */
const CUSTOMER_ADMIN = { email: "admin@pharmaglimmora.com", password: "Admin@123" };
const REGIONS = ["FDA", "EMA", "MHRA"];

async function login(page: Page, who: { email: string; password: string }) {
  await page.goto("/login");
  await page.locator("#email").fill(who.email);
  await page.locator("#password").fill(who.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25_000 });
  if (page.url().includes("/site-picker")) {
    await page.getByRole("button", { name: /all sites|continue|dashboard/i }).first().click().catch(() => {});
    await page.waitForURL((u) => !u.pathname.startsWith("/site-picker"), { timeout: 25_000 }).catch(() => {});
  }
}

/** Open the first customer account's edit modal via its row ⋮ menu. */
async function openFirstAccountEditor(page: Page) {
  await page.goto("/admin");
  await page.getByRole("heading", { name: /customer accounts/i }).first().waitFor({ timeout: 20_000 });
  await page.locator("table tbody tr").first().locator("td").last().locator("button").first().click();
  await page.getByRole("option", { name: /^edit$/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

/** The regions MultiSelect — the only role="combobox" on the account form. */
const regionCombo = (page: Page) => page.locator('[role="combobox"][aria-haspopup="listbox"]').first();
const regionListbox = (page: Page) => page.getByRole("listbox", { name: /regulatory region/i });

test("super admin assigns several regions and they persist", async ({ page }) => {
  // `page.reload()` below aborts whatever request is in flight, and the browser
  // reports that as "Failed to fetch". That is the navigation, not the app, so
  // it is filtered out — everything else still fails the test.
  const isNavigationAbort = (s: string) => /Failed to fetch|NetworkError|aborted/i.test(s);
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error" && !isNavigationAbort(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => { if (!isNavigationAbort(e.message)) errors.push(e.message); });

  await login(page, SUPER_ADMIN);
  await openFirstAccountEditor(page);

  await regionCombo(page).click();
  const listbox = regionListbox(page);
  await expect(listbox).toBeVisible();
  // The ARIA contract that makes this a multi-select rather than a picker.
  await expect(listbox).toHaveAttribute("aria-multiselectable", "true");

  // Start from a known state. "Clear all" is disabled when nothing is selected,
  // which is itself the correct behaviour — don't fight it.
  const clearAll = page.getByRole("button", { name: /^clear all$/i });
  if (await clearAll.isEnabled()) await clearAll.click();

  for (const label of REGIONS) {
    await listbox.getByRole("option", { name: new RegExp(`^${label}\\b`) }).first().click();
  }
  await expect(listbox.getByRole("option", { selected: true })).toHaveCount(REGIONS.length);
  await page.keyboard.press("Escape");

  // Every selection is a removable chip.
  for (const label of REGIONS) {
    await expect(page.getByRole("button", { name: new RegExp(`^Remove ${label}\\b`) })).toBeVisible();
  }

  await page.getByRole("button", { name: /save changes/i }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 20_000 });

  // PERSISTED, not merely in Redux: full reload, then re-open the editor.
  await page.reload();
  await openFirstAccountEditor(page);
  for (const label of REGIONS) {
    await expect(
      page.getByRole("button", { name: new RegExp(`^Remove ${label}\\b`) }),
      `${label} should still be selected after a reload`,
    ).toBeVisible();
  }

  expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
});

test("the region picker is keyboard operable", async ({ page }) => {
  await login(page, SUPER_ADMIN);
  await openFirstAccountEditor(page);

  await regionCombo(page).focus();
  await page.keyboard.press("ArrowDown"); // opens
  const listbox = regionListbox(page);
  await expect(listbox).toBeVisible();

  // Focus lands in the search box, which drives aria-activedescendant so a
  // screen-reader user hears the active option while typing to filter.
  const search = page.getByRole("combobox", { name: /search regulatory region/i });
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute("aria-activedescendant", /-opt-\d+$/);

  const before = await listbox.getByRole("option", { selected: true }).count();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter"); // toggles the active option, menu stays open
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole("option", { selected: true })).not.toHaveCount(before);

  await page.keyboard.press("Escape");
  await expect(listbox).toBeHidden();
  // Escape returns focus to the trigger rather than dropping it on <body>.
  await expect(regionCombo(page)).toBeFocused();
});

test("customer admin sees the assigned regions and cannot change them", async ({ page }) => {
  await login(page, CUSTOMER_ADMIN);
  await page.goto("/settings");

  // Every region the Super Admin assigned above shows as its own chip.
  const chips = page.getByRole("list", { name: /assigned regulatory regions/i });
  await expect(chips).toBeVisible({ timeout: 20_000 });
  await expect(chips.getByRole("listitem")).toHaveCount(REGIONS.length);
  for (const label of REGIONS) {
    await expect(
      chips.getByRole("listitem").filter({ hasText: new RegExp(`^${label}\\b`) }),
      `${label} should be visible to the customer admin`,
    ).toHaveCount(1);
  }

  // RBAC: no region control anywhere on the page — assignment is Super-Admin-only.
  await expect(page.locator('[role="combobox"][aria-haspopup="listbox"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Remove (FDA|EMA|MHRA)/ })).toHaveCount(0);
});
