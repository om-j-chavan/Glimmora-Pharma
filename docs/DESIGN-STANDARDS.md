# Pharma Glimmora — UI/UX Design Standards

> The platform playbook. Every module should look and behave the same so a user
> learns the interface **once** and uses it everywhere. This document is the
> single reference for shared components, the status system, and interaction
> grammar. The **Training & Awareness (Inspection Readiness)** module is the
> reference implementation of these standards.

Status: seeded in Phase 2.5. Extend it as the standards grow (Phases 3–4).

---

## 1. Golden rules

1. **Consistency over cleverness.** Prefer a shared component at 90% fit over a
   bespoke one at 100%.
2. **One primary action per view.** The app always proposes the next step.
3. **Progressive disclosure.** Show the 3 things that matter now; defer the rest
   to drawers, `⋯` menus, and expandable sections.
4. **Never fake success, never fail silently.** Every server-action failure is
   surfaced to the user (see §4).
5. **One number, one truth.** A record's progress/readiness figure has exactly
   one source; show the same number everywhere.

---

## 2. Status taxonomy — the #1 consistency lever

**Single source of truth:** [`src/constants/statusTaxonomy.ts`](../src/constants/statusTaxonomy.ts).
Never hand-roll a colored status pill. Add a `StatusDef` to the module's
taxonomy and render it with the shared badge.

```tsx
import { StatusBadge } from "@/components/shared";
import { READINESS_STATUSES } from "@/constants/statusTaxonomy";

<StatusBadge taxonomy={READINESS_STATUSES} status={action.status} />
```

- `StatusBadge` derives a **non-color icon** per semantic (color-blind / grayscale
  safe) and a light/dark-adaptive background — you only supply the taxonomy + value.
- Register every taxonomy in `ALL_TAXONOMIES` so it appears in the shared
  `StatusGuide`.
- Existing taxonomies: Gap/Finding, CAPA, FDA 483 (Event + Observation),
  CSV/CSA, Deviation, and **Training & Awareness** (`READINESS_STATUSES`,
  `SIMULATION_STATUSES`, `TRAINING_RECORD_STATUSES`).

**Semantic colors** (used consistently across taxonomies):

| Meaning | Color | Example labels |
|---|---|---|
| Neutral / Not started | `#4B5563` gray | Not Started, Pending, Skipped |
| Active / In progress | `#1D4ED8` blue / `#B45309` amber | Open, Scheduled, In Progress |
| Awaiting review | `#6D28D9` violet | Pending QA Review, Submitted |
| Critical / Overdue | `#A32D2D` / `#B91C1C` red | Overdue, Blocked, Rejected |
| Done / Approved | `#0F6E56` green | Complete(d), Approved, Closed |

> Category ≠ status. A *category* pill (e.g. a playbook's Front/Back room) is not
> a lifecycle status and keeps its own color mapping.

---

## 3. Component inventory — use these, not raw HTML

**Forms** (`src/components/ui/`)
- `Input` — text/number/search fields. Built-in `label`, `required`, `error`,
  `hint`, `icon`. (Type union excludes `date`/`datetime-local` — use a raw input
  or `DatePicker` for those.)
- `Textarea` — multi-line, same affordances as `Input`.
- `Dropdown` — the preferred select. Supports `searchable`, `multi`
  (`values` + `onChangeMulti`), sections. **Prefer over the native `Select`.**
- `DatePicker`, `Checkbox`, `Toggle`.

**Surfaces & overlays**
- `Modal` — wide form/detail overlay.
- `Drawer` — side panel for create/edit (Phase 3 target for the readiness forms).
- `ConfirmModal` — destructive/terminal confirmations. **Never** use
  `window.confirm`.
- `Popup` — transient success/error/warning/progress notices.

**Data display**
- `Card`, `StatCard`, `CardSection`, `DataTable`, `TabBar`, `Badge`,
  `StatusBadge`, `ProgressBar`, `Stepper`, `EmptyState`, `TableSkeleton`.

**Error feedback** (`src/components/ui/ErrorPopup.tsx`)
- `useErrorPopup()` / `ErrorPopup` — the standard action-failure surface (§4).

---

## 4. Interaction grammar

| Situation | Pattern |
|---|---|
| Create / edit / multi-field entry | **Drawer** (right), context preserved |
| Terminal / destructive / e-signed action | **ConfirmModal** or centered dialog |
| Action succeeded | **Success `Popup`** (auto-dismiss) |
| Action failed | **`ErrorPopup`** — never a silent `console.error` |
| Invalid field | Inline error on the field (`Input`/`Textarea` `error` prop) |
| Move between records/modules | ⌘K command palette *(Phase 4)* |
| Filter a list | Chip/dropdown filters, saved as Views |
| Nothing to show | `EmptyState` with a primary action |
| Loading a page | Skeleton that matches the final layout |

**Standard error handling** — one call replaces the old `useState` + inline
`<Popup>` boilerplate:

```tsx
const { setError, errorPopup } = useErrorPopup();

async function onSave() {
  const res = await someServerAction(...);
  if (!res.success) {
    console.error("[module] someServerAction failed:", res.error); // telemetry
    setError(res.error ?? "Could not save. Please try again.");     // user-facing
    return;
  }
  router.refresh();
}

return (<>{/* … */}{errorPopup}</>);
```

---

## 5. Reference implementation

The **Inspection Readiness** module demonstrates the standards:
- `src/modules/readiness/tabs/TrainingPrismaTab.tsx` — `Input`/`Textarea`,
  multi-select `Dropdown` with chips, `StatusBadge`, `useErrorPopup`.
- `src/modules/readiness/RoadmapPrismaTab.tsx` — `StatusBadge`, filter dropdown,
  `useErrorPopup`.
- `src/modules/readiness/tabs/PlaybooksPrismaTab.tsx` — `Input`/`Textarea`,
  search, `ConfirmModal`, `useErrorPopup`.

---

## 6. Known follow-ups (Phases 3–4)

- Collapse module tabs to the canonical **Overview · Tasks · Evidence · Activity**.
- Standardize remaining inline-labelled `Dropdown`s onto a shared field wrapper.
- ⌘K command palette; ambient AI surfaces (Next Best Action, insights).
- Full WCAG 2.1 AA audit and motion/performance pass (Final Polish).
