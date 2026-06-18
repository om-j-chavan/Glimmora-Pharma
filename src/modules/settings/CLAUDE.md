# CLAUDE.md — Settings Module

> Module-specific rules for `src/modules/settings/`.
> Read the root CLAUDE.md first, then this file.

---

## What this module does

Settings is the **first module built** and the **source of truth** for the entire platform.
Every other screen reads its dropdown data, column visibility, tag options, and AGI behaviour
from the Redux settings slice. Until Settings is complete, no other module should be started.

---

## File structure

```
src/modules/settings/
├── CLAUDE.md                  ← this file
├── SettingsPage.tsx           ← tab shell — renders the 5 tabs
└── tabs/
    ├── OrgTab.tsx             ← company name, timezone, date format, region
    ├── SitesTab.tsx           ← add/edit sites, set risk level
    ├── UsersTab.tsx           ← add/edit users, roles, GxP Signatory toggle
    ├── FrameworksTab.tsx      ← 9 regulation toggles
    └── AGIPolicyTab.tsx       ← mode, confidence slider, 7 agent toggles
```

---

## Redux slice — `src/store/settings.slice.ts`

This slice is used by every other module. Define it here, import everywhere.

```ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface OrgSettings {
  companyName: string;
  timezone: string;
  dateFormat: string;
  regulatoryRegion: string;
}

export interface SiteConfig {
  id: string;
  name: string;
  location: string;
  gmpScope: string;
  risk: "HIGH" | "MEDIUM" | "LOW";
  status: "Active" | "Inactive";
}

export interface UserConfig {
  id: string;
  name: string;
  email: string;
  role: string;
  gxpSignatory: boolean;
  status: "Active" | "Inactive";
}

export interface FrameworkSettings {
  p210: boolean; // 21 CFR Part 210/211
  p11: boolean; // 21 CFR Part 11
  annex11: boolean; // EU GMP Annex 11
  annex15: boolean; // EU GMP Annex 15
  ichq9: boolean; // ICH Q9
  ichq10: boolean; // ICH Q10
  gamp5: boolean; // GAMP 5 (2nd Ed.)
  who: boolean; // WHO GMP
  mhra: boolean; // MHRA Guidelines
}

export interface AGISettings {
  mode: "autonomous" | "assisted" | "manual";
  confidence: number; // 50–95
  agents: {
    capa: boolean;
    deviation: boolean;
    fda483: boolean;
    drift: boolean;
    regulatory: boolean;
    supplier: boolean;
  };
}

interface SettingsState {
  org: OrgSettings;
  sites: SiteConfig[];
  users: UserConfig[];
  frameworks: FrameworkSettings;
  agi: AGISettings;
}

const initialState: SettingsState = {
  org: {
    companyName: "",
    timezone: "Asia/Kolkata",
    dateFormat: "DD/MM/YYYY",
    regulatoryRegion: "",
  },
  sites: [],
  users: [],
  frameworks: {
    p210: false,
    p11: false,
    annex11: false,
    annex15: false,
    ichq9: false,
    ichq10: false,
    gamp5: false,
    who: false,
    mhra: false,
  },
  agi: {
    mode: "autonomous",
    confidence: 72,
    agents: {
      capa: true,
      deviation: true,
      fda483: true,
      drift: true,
      regulatory: false,
      supplier: false,
    },
  },
};

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    updateOrg(state, { payload }: PayloadAction<Partial<OrgSettings>>) {
      state.org = { ...state.org, ...payload };
    },
    addSite(state, { payload }: PayloadAction<SiteConfig>) {
      state.sites.push(payload);
    },
    updateSite(
      state,
      { payload }: PayloadAction<{ id: string; patch: Partial<SiteConfig> }>,
    ) {
      const site = state.sites.find((s) => s.id === payload.id);
      if (site) Object.assign(site, payload.patch);
    },
    addUser(state, { payload }: PayloadAction<UserConfig>) {
      state.users.push(payload);
    },
    updateUser(
      state,
      { payload }: PayloadAction<{ id: string; patch: Partial<UserConfig> }>,
    ) {
      const user = state.users.find((u) => u.id === payload.id);
      if (user) Object.assign(user, payload.patch);
    },
    toggleFramework(
      state,
      { payload }: PayloadAction<keyof FrameworkSettings>,
    ) {
      state.frameworks[payload] = !state.frameworks[payload];
    },
    updateAGI(
      state,
      { payload }: PayloadAction<Partial<Omit<AGISettings, "agents">>>,
    ) {
      Object.assign(state.agi, payload);
    },
    toggleAgent(
      state,
      { payload }: PayloadAction<keyof AGISettings["agents"]>,
    ) {
      state.agi.agents[payload] = !state.agi.agents[payload];
    },
  },
});

export const {
  updateOrg,
  addSite,
  updateSite,
  addUser,
  updateUser,
  toggleFramework,
  updateAGI,
  toggleAgent,
} = settingsSlice.actions;
export default settingsSlice.reducer;
```

---

## `SettingsPage.tsx` — tab shell

```tsx
import { useState } from "react";
import { OrgTab } from "./tabs/OrgTab";
import { SitesTab } from "./tabs/SitesTab";
import { UsersTab } from "./tabs/UsersTab";
import { FrameworksTab } from "./tabs/FrameworksTab";
import { AGIPolicyTab } from "./tabs/AGIPolicyTab";

const TABS = [
  { id: "org", label: "Organization" },
  { id: "sites", label: "Sites" },
  { id: "users", label: "Users & Roles" },
  { id: "frameworks", label: "Frameworks" },
  { id: "agi", label: "AGI Policy" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SettingsPage() {
  const [active, setActive] = useState<TabId>("org");

  return (
    <main id="main-content" aria-label="Settings and administration">
      <header style={{ marginBottom: 24 }}>
        <h1 className="page-title">Settings & Administration</h1>
        <p className="page-subtitle">
          Configure organisation, sites, users, frameworks, and AGI policy
        </p>
      </header>

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Settings sections"
        style={{
          display: "flex",
          borderBottom: "1px solid var(--bg-border)",
          marginBottom: 24,
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-btn-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`tab-panel-${tab.id}`}
            onClick={() => setActive(tab.id)}
            style={{
              padding: "10px 16px",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              border: "none",
              borderBottom:
                active === tab.id
                  ? "2px solid var(--brand)"
                  : "2px solid transparent",
              background: "transparent",
              color:
                active === tab.id ? "var(--brand)" : "var(--text-secondary)",
              transition: "all 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {TABS.map((tab) => (
        <section
          key={tab.id}
          role="tabpanel"
          id={`tab-panel-${tab.id}`}
          aria-labelledby={`tab-btn-${tab.id}`}
          tabIndex={0}
          hidden={active !== tab.id}
        >
          {tab.id === "org" && <OrgTab />}
          {tab.id === "sites" && <SitesTab />}
          {tab.id === "users" && <UsersTab />}
          {tab.id === "frameworks" && <FrameworksTab />}
          {tab.id === "agi" && <AGIPolicyTab />}
        </section>
      ))}
    </main>
  );
}
```

---

## `OrgTab.tsx`

### What it reads / writes

- Reads: `state.settings.org`
- Writes: `updateOrg(patch)`
- Effect: company name → topbar, all PDFs, audit certs; timezone → all timestamps

### Form schema

```ts
import { z } from "zod";

export const orgSchema = z.object({
  companyName: z.string().min(2, "Company name is required"),
  timezone: z.string().min(1, "Timezone is required"),
  dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]),
  regulatoryRegion: z.string().min(1, "Regulatory region is required"),
});

export type OrgFormValues = z.infer<typeof orgSchema>;
```

### Semantic structure

```tsx
<section aria-labelledby="org-heading">
  <h2 id="org-heading">Organisation</h2>
  <form
    onSubmit={handleSubmit(onSave)}
    aria-label="Organisation settings"
    noValidate
  >
    <fieldset>
      <legend className="sr-only">Organisation identity</legend>
      <div>
        <label htmlFor="company-name">
          Company Name <span aria-hidden="true">*</span>
          <span className="sr-only">(required)</span>
        </label>
        <input
          id="company-name"
          type="text"
          className="input"
          aria-required="true"
          aria-describedby={
            errors.companyName ? "company-name-error" : "company-name-hint"
          }
          {...register("companyName")}
        />
        <p
          id="company-name-hint"
          className="text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          Appears in header, PDF exports, and audit certificates
        </p>
        {errors.companyName && (
          <p
            id="company-name-error"
            role="alert"
            style={{ color: "var(--danger)", fontSize: 12 }}
          >
            {errors.companyName.message}
          </p>
        )}
      </div>
    </fieldset>

    <div role="status" aria-live="polite">
      {saved && <p>Settings saved successfully</p>}
    </div>

    <button
      type="submit"
      className="btn-primary"
      aria-label="Save organisation settings"
    >
      Save changes
    </button>
  </form>
</section>
```

---

## `SitesTab.tsx`

### What it reads / writes

- Reads: `state.settings.sites`
- Writes: `addSite(site)`, `updateSite({ id, patch })`
- Effect: feeds login site picker, all site dropdowns, dashboard heatmap, command center

### Required fields for each site

```ts
interface SiteFormValues {
  name: string; // min 2 chars
  location: string;
  gmpScope: string;
  risk: "HIGH" | "MEDIUM" | "LOW";
  status: "Active" | "Inactive";
}
```

### Semantic structure

```tsx
<section aria-labelledby="sites-heading">
  <h2 id="sites-heading">Sites</h2>

  {/* Existing sites table */}
  <table className="data-table" aria-label="Configured GMP sites">
    <caption className="sr-only">
      List of registered facilities with risk level and status
    </caption>
    <thead>
      <tr>
        <th scope="col">Site name</th>
        <th scope="col">Location</th>
        <th scope="col">GMP scope</th>
        <th scope="col">Risk level</th>
        <th scope="col">Status</th>
        <th scope="col">
          <span className="sr-only">Actions</span>
        </th>
      </tr>
    </thead>
    <tbody>
      {sites.map((site) => (
        <tr key={site.id}>
          <th scope="row">{site.name}</th>
          <td>{site.location}</td>
          <td>{site.gmpScope}</td>
          <td>
            <span
              className={`badge badge-${riskClass(site.risk)}`}
              role="status"
            >
              {site.risk}
            </span>
          </td>
          <td>{site.status}</td>
          <td>
            <button
              type="button"
              aria-label={`Edit ${site.name}`}
              className="btn-ghost"
            >
              <Edit2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>

  {/* Add site form */}
  <form onSubmit={handleSubmit(onAdd)} aria-label="Add new site" noValidate>
    <fieldset>
      <legend>New site details</legend>
      ...
    </fieldset>
    <button type="submit" className="btn-primary">
      Add site
    </button>
  </form>
</section>
```

---

## `UsersTab.tsx`

### What it reads / writes

- Reads: `state.settings.users`
- Writes: `addUser(user)`, `updateUser({ id, patch })`
- Effect: feeds all owner dropdowns; GxP Signatory controls Sign & Close button visibility

### All 8 roles — use this exact list in the role `<select>`

```ts
const ROLES = [
  { value: "super_admin", label: "Super Admin" },
  { value: "qa_head", label: "QA Head" },
  { value: "qc_lab_director", label: "QC/Lab Director" },
  { value: "regulatory_affairs", label: "Regulatory Affairs" },
  { value: "csv_val_lead", label: "CSV/Val Lead" },
  { value: "it_cdo", label: "IT/CDO" },
  { value: "operations_head", label: "Operations Head" },
  { value: "viewer", label: "Viewer" },
] as const;
```

### GxP Signatory toggle — semantic pattern

```tsx
<div
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  }}
>
  <div>
    <label id={`sig-label-${user.id}`} style={{ fontWeight: 500 }}>
      GxP Signatory Authority
    </label>
    <p
      id={`sig-desc-${user.id}`}
      style={{ color: "var(--text-muted)", fontSize: 12 }}
    >
      Enables Sign & Approve buttons for this user
    </p>
  </div>
  <button
    type="button"
    role="switch"
    aria-checked={user.gxpSignatory}
    aria-labelledby={`sig-label-${user.id}`}
    aria-describedby={`sig-desc-${user.id}`}
    onClick={() =>
      dispatch(
        updateUser({
          id: user.id,
          patch: { gxpSignatory: !user.gxpSignatory },
        }),
      )
    }
    className={`toggle-track ${user.gxpSignatory ? "on" : "off"}`}
  >
    <span className="toggle-thumb" />
    <span className="sr-only">
      {user.gxpSignatory ? "Enabled" : "Disabled"}
    </span>
  </button>
</div>
```

### Deactivate — what it means

When a user is set to `Inactive`:

- They cannot log in
- Their name disappears from all owner dropdowns (filter `status === 'Active'` everywhere)
- Open CAPAs assigned to them must be flagged (AGI will surface this)
- All past records, signatures, and audit trail entries are preserved — immutable

---

## `FrameworksTab.tsx`

### What it reads / writes

- Reads: `state.settings.frameworks`
- Writes: `toggleFramework(key)`

### The 3-effect rule — every toggle does exactly these 3 things

| Toggle    | Gap Assessment tag | CSV/CSA column         | AGI ruleset                                      |
| --------- | ------------------ | ---------------------- | ------------------------------------------------ |
| `p210`    | 21 CFR 210/211     | —                      | Manufacturing GMP patterns                       |
| `p11`     | 21 CFR Part 11     | Part 11 Status         | Audit trail gaps, e-sig enforcement              |
| `annex11` | EU GMP Annex 11    | Annex 11 Status        | Annex 11 clause references                       |
| `annex15` | EU GMP Annex 15    | IQ/OQ/PQ roadmap steps | Qualification stage checks                       |
| `ichq9`   | ICH Q9             | —                      | ICH Q9 risk scoring (patient safety, recurrence) |
| `ichq10`  | ICH Q10            | —                      | Management review KPIs                           |
| `gamp5`   | GAMP 5             | GAMP 5 Category        | Category-based validation depth                  |
| `who`     | WHO GMP            | —                      | WHO GMP clause patterns                          |
| `mhra`    | MHRA               | —                      | MHRA DI focus rules                              |

Toggle OFF does NOT delete existing data. Past findings tagged to that framework keep their tags —
the tag option just disappears from the add-new dropdown.

### Semantic structure

```tsx
<section aria-labelledby="frameworks-heading">
  <h2 id="frameworks-heading">Regulatory Frameworks</h2>
  <p>
    Each toggle activates three things: regulation tag in Gap Assessment,
    compliance column in CSV/CSA, and AGI detection rules for that regulation.
  </p>

  <ul
    role="list"
    aria-label="Regulatory framework toggles"
    style={{ listStyle: "none", padding: 0 }}
  >
    {FRAMEWORKS.map((fw) => (
      <li
        key={fw.key}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 0",
          borderBottom: "1px solid var(--bg-border)",
        }}
      >
        <div>
          <p
            id={`fw-label-${fw.key}`}
            style={{ fontWeight: 500, color: "var(--text-primary)" }}
          >
            {fw.name}
          </p>
          <p
            id={`fw-desc-${fw.key}`}
            style={{ fontSize: 12, color: "var(--text-muted)" }}
          >
            {fw.description}
          </p>
          <p style={{ fontSize: 11, color: "var(--brand)", marginTop: 2 }}>
            → {fw.effect}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={frameworks[fw.key]}
          aria-labelledby={`fw-label-${fw.key}`}
          aria-describedby={`fw-desc-${fw.key}`}
          onClick={() => dispatch(toggleFramework(fw.key))}
          className={`toggle-track ${frameworks[fw.key] ? "on" : "off"}`}
        >
          <span className="toggle-thumb" />
          <span className="sr-only">{frameworks[fw.key] ? "On" : "Off"}</span>
        </button>
      </li>
    ))}
  </ul>
</section>
```

---

## `AGIPolicyTab.tsx`

### What it reads / writes

- Reads: `state.settings.agi`
- Writes: `updateAGI(patch)`, `toggleAgent(key)`

### Mode — what each value does across the entire platform

| Value        | What happens everywhere                                         |
| ------------ | --------------------------------------------------------------- |
| `autonomous` | Live alert banners appear immediately on all affected screens   |
| `assisted`   | All alerts go to a review queue — no live pop-ups anywhere      |
| `manual`     | AGI monitors silently — no alerts, no suggestions on any screen |

### Confidence threshold

Range: 50 – 95. Higher = fewer alerts, higher reliability.
This value is shown on every AGI suggestion panel across the platform.

### Agent toggles

| Key          | Agent                   | Effect when OFF                               |
| ------------ | ----------------------- | --------------------------------------------- |
| `capa`       | CAPA Effectiveness      | No CAPA overdue alerts anywhere               |
| `deviation`  | Deviation Intelligence  | No recurring deviation alerts                 |
| `fda483`     | FDA 483 Draft Response  | No draft text suggestions on 483 screen       |
| `batch`      | Batch Readiness         | No batch readiness scores                     |
| `drift`      | Drift Detection         | No configuration change / access creep alerts |
| `regulatory` | Regulatory Intelligence | No FDA/EMA guidance monitoring                |
| `supplier`   | Supplier Quality        | No vendor risk scoring                        |

### Semantic structure

```tsx
<section aria-labelledby="agi-heading">
  <h2 id="agi-heading">AGI Policy</h2>

  {/* Mode select */}
  <div style={{ marginBottom: 24 }}>
    <label htmlFor="agi-mode" style={{ fontWeight: 500 }}>
      Operating Mode
    </label>
    <p
      id="agi-mode-hint"
      style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 8px" }}
    >
      Controls how and when AGI alerts appear across all screens
    </p>
    <select
      id="agi-mode"
      className="select"
      aria-describedby="agi-mode-hint"
      value={agi.mode}
      onChange={(e) =>
        dispatch(updateAGI({ mode: e.target.value as AGISettings["mode"] }))
      }
    >
      <option value="autonomous">Autonomous — live alerts everywhere</option>
      <option value="assisted">Assisted — review queue, no live pop-ups</option>
      <option value="manual">Manual — silent monitoring, no alerts</option>
    </select>
  </div>

  {/* Confidence slider */}
  <div style={{ marginBottom: 24 }}>
    <label htmlFor="agi-confidence" style={{ fontWeight: 500 }}>
      Confidence Threshold: <strong>{agi.confidence}%</strong>
    </label>
    <p
      id="agi-conf-hint"
      style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 8px" }}
    >
      Higher = fewer suggestions, higher reliability. Lower = catches more weak
      signals.
    </p>
    <input
      id="agi-confidence"
      type="range"
      min={50}
      max={95}
      step={1}
      value={agi.confidence}
      aria-describedby="agi-conf-hint"
      aria-valuemin={50}
      aria-valuemax={95}
      aria-valuenow={agi.confidence}
      aria-valuetext={`${agi.confidence} percent confidence`}
      onChange={(e) =>
        dispatch(updateAGI({ confidence: Number(e.target.value) }))
      }
    />
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 11,
        color: "var(--text-muted)",
      }}
    >
      <span>50% — more alerts</span>
      <span>95% — fewer alerts</span>
    </div>
  </div>

  {/* Agent toggles */}
  <fieldset style={{ border: "none", padding: 0 }}>
    <legend style={{ fontWeight: 500, marginBottom: 12 }}>
      Per-Module Agents
    </legend>
    <ul
      role="list"
      aria-label="AGI agent toggles"
      style={{ listStyle: "none", padding: 0 }}
    >
      {AGENTS.map((agent) => (
        <li
          key={agent.key}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 0",
            borderBottom: "1px solid var(--bg-border)",
          }}
        >
          <div>
            <span
              id={`agent-label-${agent.key}`}
              style={{ fontWeight: 500, color: "var(--text-primary)" }}
            >
              {agent.name}
            </span>
            <p
              id={`agent-desc-${agent.key}`}
              style={{ fontSize: 12, color: "var(--text-muted)" }}
            >
              {agent.description}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={agi.agents[agent.key]}
            aria-labelledby={`agent-label-${agent.key}`}
            aria-describedby={`agent-desc-${agent.key}`}
            onClick={() => dispatch(toggleAgent(agent.key))}
            className={`toggle-track ${agi.agents[agent.key] ? "on" : "off"}`}
          >
            <span className="toggle-thumb" />
            <span className="sr-only">
              {agi.agents[agent.key] ? "On" : "Off"}
            </span>
          </button>
        </li>
      ))}
    </ul>
  </fieldset>
</section>
```

---

## Form validation — all tabs use react-hook-form + zod

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";

// Pattern for every settings form
const {
  register,
  handleSubmit,
  formState: { errors, isSubmitting },
} = useForm({
  resolver: zodResolver(schema),
  defaultValues: useAppSelector((s) => s.settings.org), // pre-fill from Redux
});

const onSave = (data: FormValues) => {
  dispatch(updateOrg(data));
  // show success status
};
```

---

## What Settings does NOT do

- Never calls an API directly — Settings writes to Redux only. The API sync layer (if needed) is a separate concern outside this module.
- Never reads from `auth` slice except `auth.user.role` (for super_admin guard on the Settings route).
- Never has its own AGI suggestion panels — Settings is configuration, not compliance work.
- Never shows audit trail entries — the audit trail is read-only and lives in a separate module.
