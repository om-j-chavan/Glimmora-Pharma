# QC / Lab Director — End-to-End Test Guide (Beginner Friendly)

> **Goal:** Log in as the **QC / Lab Director** persona and test every screen this role
> touches, using the built-in mock/seed data. For each step you'll see:
> **What to do → What you should see (expected) → How to record a problem.**
>
> **Test account (seeded mock user):**
> - Email: `qc@pharmaglimmora.com`
> - Password: `Demo@123`
> - Person: Dr. Nisha Rao · Site: Chennai QC Laboratory

---

## What this role is allowed to do (read this first)

Every screen behaves differently depending on your role. The QC/Lab Director has these
access levels (this is *the* thing you are testing — that the screen matches the level):

| Module           | Access level | What that means in the UI |
|------------------|--------------|---------------------------|
| Dashboard        | **read-only**| You can view KPIs, but not edit |
| Gap Assessment   | **full**     | You can create/edit findings, raise CAPA |
| QMS & CAPA       | **limited**  | You can view + do *some* actions, but not full admin |
| CSV / CSA        | **full**     | Full access |
| FDA 483 / WL     | **read-only**| View only, no editing |
| Evidence & Docs  | **full**     | Full access |
| AGI (AI agents)  | **read-only**| Can view AI output, cannot change AI settings |
| Governance & KPIs| **read-only**| View only |
| Settings         | **none**     | Should be hidden / blocked entirely |

> **Rule of thumb for testing:** On a "full" screen the action buttons (Add / Edit / Save)
> must be **clickable**. On a "read-only" screen they must be **hidden or disabled**. On a
> "none" screen the menu item should **not appear at all** (or block you if you type the URL).

---

## PART 0 — Start the application (do this every time)

You need **two** programs running at once: the **backend** (the AI brain, port 8000) and the
**frontend** (the website you click on, port 3000). Open **two separate PowerShell windows**.

### 0.1 Start the Backend (Window 1)

```powershell
cd C:\Users\nithi\Pharma\pharma_glimmora_ai_backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

**Expected:** You see `Uvicorn running on http://127.0.0.1:8000`. Leave this window open.

> ℹ️ If the AI panels later show "demo data" instead of crashing, that's fine — the app is
> designed to fall back to mock AI if the backend is down. But for a real end-to-end test,
> keep this running.

### 0.2 Start the Frontend (Window 2)

```powershell
cd C:\Users\nithi\Pharma\Glimmora-Pharma
npm run dev:web
```

**Expected:** You see `Ready` and `Local: http://localhost:3000`. Leave this open too.

### 0.3 Open the app

Open your browser (Chrome recommended) and go to: **http://localhost:3000**

**Expected:** You land on a login page with the Glimmora logo and a "Welcome !" heading.

> 🐞 **If the page won't load** → check Window 2 for red error text. Most common beginner
> issue is the database isn't seeded. Fix in Part 0.4.

### 0.4 (Only if data is missing) Seed the mock data

If you log in later and screens are **empty** (no findings, no CAPAs), the database needs
seeding. **Stop the frontend first** (click Window 2, press `Ctrl+C`), then:

```powershell
cd C:\Users\nithi\Pharma\Glimmora-Pharma
npx prisma db push
npm run db:seed
npm run dev:web
```

**Expected:** Seed output lists created tenants, users, sites, findings, CAPAs. Now the
mock data exists.

---

## PART 1 — Log in as QC / Lab Director

| # | What to do | What you should see (Expected) |
|---|------------|--------------------------------|
| 1.1 | On the login page, click **"Show dev credentials"** at the bottom | A table of demo accounts appears |
| 1.2 | Click the row labelled **QC/Lab Director** (`qc@pharmaglimmora.com`) | Email + password fields auto-fill |
| 1.3 | Click **Sign in** | A spinner ("Loading…"), then you land on the **Dashboard** |
| 1.4 | Look at the top-right corner | It should show **Dr. Nisha Rao** and the site **Chennai QC Laboratory** |
| 1.5 | Look at the **left sidebar** | You should see menu items for Dashboard, Gap Assessment, QMS & CAPA, CSV, Evidence, etc. **Settings should NOT appear** |

> 🐞 **Issue to watch for:** If "Settings" *does* appear in the sidebar for this role, that's
> a permission bug (this role is `settings: none`). Record it (see Part 4).

---

## PART 2 — Test the Dashboard (read-only)

| # | What to do | Expected |
|---|------------|----------|
| 2.1 | You're already on the Dashboard after login | KPI cards/charts load with numbers (not blank) |
| 2.2 | Look for any "Edit" / "Add" / "Configure" buttons | There should be **none** (this role is read-only here) |
| 2.3 | Scroll to the **AGI Insights** section | It shows AI insight cards or a "standing alert" (e.g. Regulatory Intelligence) |

> ℹ️ **Known behaviour (not a bug):** Some finding-based insights only appear *after* you
> visit the Gap module once. So if Dashboard AGI Insights look thin on first load, that's
> expected — re-check the dashboard after Part 3.

---

## PART 3 — Test Gap Assessment (FULL access — the main job of this role)

This is the QC Director's primary workspace. Click **Gap Assessment** in the sidebar.

**Expected:** A page titled **"Gap Assessment & Findings"** with a subtitle like
`N findings · X critical · Y open`, and **three tabs**: Summary · Findings Register · Evidence Index.

### 3.1 Summary tab

| # | What to do | Expected |
|---|------------|----------|
| 3.1.1 | Stay on the **Summary** tab | You see severity charts (Critical/High/Low) and "top drivers" by area |
| 3.1.2 | Confirm a **"Report Gap"** button is visible (top right) | It IS visible — because this role has **full** gap access |

### 3.2 Findings Register tab — filter to your lab findings

| # | What to do | Expected |
|---|------------|----------|
| 3.2.1 | Click the **Findings Register** tab | A table of findings appears |
| 3.2.2 | In the **"All areas"** filter dropdown, pick **QC Lab** | Table now shows **only QC Lab** findings |
| 3.2.3 | In the **"All severities"** dropdown, pick **Critical** | Table narrows to QC Lab + Critical findings |
| 3.2.4 | Click the **eye / view icon** on a finding row | A detail panel opens: requirement, AGI summary, evidence reference |
| 3.2.5 | Click **"Clear filters"** | All findings return |

> ℹ️ Severity options are **Critical / High / Low** (not "Major"). If you're following the
> older manual that says "Major", use **Critical** instead.

### 3.3 Create a finding (testing FULL access write)

| # | What to do | Expected |
|---|------------|----------|
| 3.3.1 | Click **"Report Gap"** | An "Add Finding" form/modal opens |
| 3.3.2 | Fill: Requirement (e.g. *"LIMS audit trail not reviewed"*), Area = **QC Lab**, Framework = **Part 11**, Severity = **Critical**, a Target Date | Fields accept input |
| 3.3.3 | Click **Save** | A green popup **"Finding logged"** appears; the new row shows in the register |
| 3.3.4 | Find your new finding, open it, click **"Raise CAPA"** | A popup **"CAPA raised — CAPA-… created and linked"** appears with a "Go to CAPA Tracker" button |

> ℹ️ Because you chose framework **Part 11**, the raised CAPA is automatically flagged as
> **DI-gated** (data-integrity gate required) — you'll verify that next in Part 4.

### 3.4 Evidence Index tab — inspection readiness

| # | What to do | Expected |
|---|------------|----------|
| 3.4.1 | Click the **Evidence Index** tab | Areas listed (Manufacturing, QC Lab, …) each with a status: Complete / Partial / Missing |
| 3.4.2 | Expand the **QC Lab** area | Rows show each finding's evidence status |
| 3.4.3 | On a "Missing"/"Partial" row, click **link/upload evidence** | Evidence modal opens; you can paste a link or upload a file |
| 3.4.4 | Save evidence on a finding, then close that finding | Status moves toward **Complete** |

> 🎯 **Inspection-readiness goal:** the **QC Lab** node should read **"Complete"** before an
> inspection. Getting it there is a valid end-to-end test.

---

## PART 4 — Test QMS & CAPA (LIMITED access) + the DI Gate

Click **QMS & CAPA** in the sidebar.

| # | What to do | Expected |
|---|------------|----------|
| 4.1 | Find the CAPA you raised in step 3.3.4 (search its CAPA-ID) | It appears in the list |
| 4.2 | Look for a purple **"DI"** badge on the row | Present, because it came from a Part 11 finding |
| 4.3 | Open the CAPA detail → look at the **action plan** | There's a **DI gate step** that must be "Closed" before the CAPA can close |
| 4.4 | Try a **full-admin** action (e.g. delete the CAPA, or reassign owner) | Because access is **limited**, some admin actions should be **disabled/hidden** — confirm which |

> 🐞 **Record exactly which buttons are enabled vs disabled here.** "Limited" is the
> trickiest level — the test is whether the *right* subset of actions is blocked.

---

## PART 5 — Quickly test the remaining modules (permission spot-checks)

For these, you're mostly checking the **access level matches the screen**.

| # | Module (sidebar) | Access | What to do | Expected |
|---|------------------|--------|------------|----------|
| 5.1 | **CSV / CSA** | full | Open it, try Add/Edit | Action buttons work |
| 5.2 | **FDA 483 / WL** | read-only | Open it, look for edit/draft buttons | **No** editing; view only |
| 5.3 | **Evidence & Docs** | full | Open it, try upload | Upload works |
| 5.4 | **AGI / AI Agents** | read-only | Open it | You can see AI output but **cannot toggle** AI settings |
| 5.5 | **Governance & KPIs** | read-only | Open it | Charts visible, no edit |
| 5.6 | **Settings** | none | It should be **absent** from the sidebar. Also try typing `http://localhost:3000/settings` directly | You're **blocked / redirected** — not allowed in |

---

## PART 6 — How to record an issue (use this every time something is wrong)

When a step's result ≠ the Expected column, write it down in this exact format. Consistent
bug reports are what make them fixable.

```
ISSUE #__
Module/Step:      (e.g. Part 1, step 1.5 — Sidebar)
What I did:       (the exact clicks)
What I expected:  (from the Expected column)
What happened:    (the actual wrong behaviour)
Severity:         Blocker / Major / Minor / Cosmetic
Screenshot:       (filename, if any)
Console errors:   (press F12 → Console tab → copy any red text)
```

> 🔑 **The single most useful thing for fixing a bug:** press **F12** in the browser, go to
> the **Console** tab, and copy any **red** error lines. Also check **Window 2** (frontend
> terminal) for server-side red errors. Paste both into the issue.

---

## PART 7 — Worked examples: common issues & how they get solved

These are the kinds of problems this app has hit before, so you know what a real
"raise → diagnose → fix" cycle looks like.

### Example A — "A screen is completely empty (no findings/CAPAs)"
- **Symptom:** Gap/CAPA tables show nothing.
- **Diagnose:** The mock data was never loaded into the local database.
- **Fix:** Run the seed (Part 0.4): `npx prisma db push` → `npm run db:seed`. Re-login.

### Example B — "AGI panel shows 'demo data' / doesn't reflect real numbers"
- **Symptom:** An AI insight card says it's mock, or numbers look canned.
- **Diagnose:** The backend (Window 1) isn't running, so the app fell back to mock AI on purpose.
- **Fix:** Start the backend (Part 0.1). Refresh the page. The panel now calls the real API.

### Example C — "A button I should be able to click is greyed out (or vice versa)"
- **Symptom:** e.g. "Report Gap" missing even though Gap = full; or Settings visible though it's `none`.
- **Diagnose:** Permission mismatch between the screen and the role matrix
  (`src/store/permissions.slice.ts`, the `qc_lab_director` row).
- **Fix:** This is a **real code bug to report**, not a setup problem. Record it (Part 6) with
  the module name so the permission gate / `usePermissions(...)` check can be corrected.

### Example D — "Login fails with 'Incorrect email or password'"
- **Symptom:** Can't sign in with the QC credentials.
- **Diagnose:** Either a typo, or the users weren't seeded.
- **Fix:** Use the **"Show dev credentials"** auto-fill (Part 1.1) to rule out typos. Still
  failing → re-seed (Part 0.4), which creates `qc@pharmaglimmora.com`.

---

## PART 8 — Final checklist (tick these to call the role "tested end-to-end")

- [ ] Logged in as QC/Lab Director; correct name + site shown
- [ ] Settings is **not** accessible (sidebar + direct URL)
- [ ] Dashboard loads read-only (no edit buttons)
- [ ] Gap: filtered to QC Lab + Critical, opened a finding detail
- [ ] Gap: created a new finding (full access confirmed)
- [ ] Gap: raised a CAPA from the finding
- [ ] Gap: brought the QC Lab evidence node toward "Complete"
- [ ] CAPA: found the DI-gated CAPA with the purple "DI" badge
- [ ] Read-only modules (FDA 483, Governance, AGI) show no edit controls
- [ ] Full modules (CSV, Evidence) allow edits
- [ ] All issues recorded in the Part 6 format with F12 console errors

---

*When you've filled in your issues, paste them back and I'll help you diagnose and fix each
one against the actual code.*
