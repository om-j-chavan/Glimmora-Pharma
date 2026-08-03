import { test, expect, type Page } from "@playwright/test";

/**
 * DASHBOARD LAYOUT — geometry regression harness.
 *
 * `role-dashboard.spec.ts` proves the right widgets render for the right role.
 * This spec proves the resulting page has a sound BOX MODEL, because the defects it
 * guards against are invisible to a content assertion:
 *
 *   • The dashboard used to be two independent stacks — a 2/3 "main" column beside a
 *     1/3 rail. A role's rail carries five or six cards and its main column two to
 *     four, so the grid row (sized to the taller stack) left a dead band the width of
 *     the main column under the shorter one: 641px for Regulatory Affairs and 776px
 *     for Operations Head at 1440px wide. Widgets are grid ITEMS now, so the packing
 *     follows the content instead of a fixed 2:1 assumption.
 *
 *   • The 90-day action plan is the one card whose height is data-driven. Unbounded
 *     it reached 1491px, four times a normal card, and dictated its row's height on
 *     its own.
 *
 *   • Its eight columns are wider than a phone, and with no scroll box of their own
 *     the right-hand ones were clipped away by the card and unreachable.
 *
 *   • A widget that renders `null` (a flag-disabled panel, an empty quick-action
 *     list) used to be harmless inside a stack. As a grid item it would hold an empty
 *     track open, so the resolver drops those keys before they are laid out.
 */

const PASSWORD = "Demo@123";

/** Widest acceptable dead band inside one grid row. */
const MAX_ROW_GAP = 480;

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "mobile", width: 390, height: 844 },
];

/** Seat roles whose rail/main balance differs most — the layout's extremes. */
const ROLES = [
  { role: "qa_head", email: "qa@pharmaglimmora.com" },
  { role: "regulatory_affairs", email: "ra@pharmaglimmora.com" },
  { role: "operations_head", email: "ops@pharmaglimmora.com" },
];

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((u) => u.pathname === "/" || u.pathname.startsWith("/site-picker"), { timeout: 25_000 });
  if (page.url().includes("/site-picker")) {
    await page.getByRole("button", { name: /all sites|continue|dashboard/i }).first().click().catch(() => {});
    await page.waitForURL((u) => u.pathname === "/", { timeout: 25_000 }).catch(() => {});
  }
}

/** Everything the assertions below need, measured in one pass. */
function measure() {
  const main = document.querySelector("main")!;
  const grid = Array.from(main.querySelectorAll<HTMLElement>("div")).find((d) =>
    d.className.includes("grid-auto-flow:row_dense"),
  );

  const viewportW = document.documentElement.clientWidth;

  /* An element wider than the viewport only matters when NO ancestor scrolls or
     clips it — that is the case that puts a scrollbar on the page or silently cuts
     content off. A table inside its own `overflow-auto` box is fine. */
  const escaping: string[] = [];
  main.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.right <= viewportW + 1) return;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden") return;
    }
    escaping.push(`${el.tagName}.${String(el.className).slice(0, 40)} right=${Math.round(r.right)}`);
  });

  /* Grid items sharing a top edge are one row; the dead band in that row is the
     distance from the shortest item's bottom to the row's bottom. */
  const rows = new Map<number, number[]>();
  const emptyItems: string[] = [];
  for (const child of Array.from(grid?.children ?? []) as HTMLElement[]) {
    const r = child.getBoundingClientRect();
    if (r.height === 0) emptyItems.push(child.className);
    const top = Math.round(r.top);
    rows.set(top, [...(rows.get(top) ?? []), Math.round(r.bottom)]);
  }
  let worstRowGap = 0;
  for (const bottoms of rows.values()) {
    const rowBottom = Math.max(...bottoms);
    for (const b of bottoms) worstRowGap = Math.max(worstRowGap, rowBottom - b);
  }

  return {
    foundGrid: Boolean(grid),
    itemCount: grid?.children.length ?? 0,
    emptyItems,
    escaping: escaping.slice(0, 5),
    worstRowGap,
    mainScrollW: main.scrollWidth,
    mainClientW: main.clientWidth,
    bodyScrollW: document.body.scrollWidth,
    viewportW,
    // Trailing whitespace: the gap between the last widget and the end of the page.
    trailingGap: grid
      ? Math.round(main.scrollHeight - (grid.getBoundingClientRect().bottom - main.getBoundingClientRect().top + main.scrollTop))
      : 0,
  };
}

for (const { role, email } of ROLES) {
  test(`dashboard layout is sound for ${role}`, async ({ page }) => {
    await login(page, email);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 20_000 });

    /* The two removed sections must be gone for every role and every width. */
    await expect(page.getByText("Recent activity", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: /Reports available/i })).toHaveCount(0);

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      // Recharts' ResponsiveContainer re-measures on resize; let it settle.
      await page.waitForTimeout(900);
      const m = await page.evaluate(measure);
      const at = `${role} @ ${vp.name} (${vp.width}px)`;

      expect(m.foundGrid, `${at}: widget grid not found`).toBe(true);
      expect(m.itemCount, `${at}: no widgets rendered`).toBeGreaterThan(0);

      // No widget slot is held open by a component that renders nothing.
      expect(m.emptyItems, `${at}: zero-height grid item(s): ${m.emptyItems.join(", ")}`).toHaveLength(0);

      // Nothing escapes its track, so the page never scrolls sideways and no card
      // silently clips its own content.
      expect(m.escaping, `${at}: content escapes its container: ${m.escaping.join(" | ")}`).toHaveLength(0);
      expect(m.mainScrollW, `${at}: main scrolls horizontally`).toBeLessThanOrEqual(m.mainClientW + 1);
      expect(m.bodyScrollW, `${at}: body scrolls horizontally`).toBeLessThanOrEqual(m.viewportW + 1);

      // No dead band big enough to read as "the dashboard is broken".
      expect(m.worstRowGap, `${at}: ${m.worstRowGap}px of dead space inside a grid row`).toBeLessThanOrEqual(MAX_ROW_GAP);

      // The page ends where the widgets end — no trailing blank band.
      expect(Math.abs(m.trailingGap), `${at}: ${m.trailingGap}px of trailing blank space`).toBeLessThanOrEqual(64);
    }
  });
}
