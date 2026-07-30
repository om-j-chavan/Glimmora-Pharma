# Process — Training & Awareness (Inspection Readiness)

> **A lighter process than the others.** This chapter covers only the parts that actually do something:
> setting up an inspection to prepare for, marking readiness tasks complete, running practice drills,
> and closing out an inspection. There isn't much for a working role to do here beyond viewing.

## 1. What this process achieves

This process helps you get ready for an inspection and see how prepared you are. Setting up an inspection
creates a standard set of readiness tasks; completing them raises a readiness score. You can also
schedule and score practice drills.

## 2. Who takes part

| Role | Raise | Fill | Assign | Review | Sign | Close | View only |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **QA Head** | ✓ | ✓ | — | — | — | ✓ | |
| **Customer Admin** | | ✓ | — | — | — | | |
| **QA** | | | — | — | — | | ✓ |
| **CSV / Validation Lead** | | | — | — | — | | ✓ |
| **Regulatory Affairs** | | | — | — | — | | ✓ |
| **QC Lab Director** | | | — | — | — | | ✓ |
| **IT / CDO** | | | — | — | — | | ✓ |
| **Operations Head** | | | — | — | — | | ✓ |
| **Viewer** | | | — | — | — | | ✓ |

- **Raise** — set up an inspection to prepare for (QA Head). **Fill** — mark readiness tasks complete and
  run practice drills (QA Head and Customer Admin). **Close** — close out an inspection (QA Head).
- There is **no signed step** here, so the Sign column is not used.
- Everyone else can open the screen to see the readiness picture, but doesn't change it.

## 3. The process, step by step

### Step 1 — Set up an inspection to prepare for
- **Who:** QA Head.
- **Opens and clicks:** **Training & Awareness** → **New Inspection**.
- **Fills in:** a **title**, a **site**, a **lead**, and an expected **date**. All required.
- **Gate:** none.
- **Signed action?** No.
- **Status after:** the inspection is created with a standard set of readiness tasks, all **Not Started**.

### Step 2 — Mark a readiness task complete
- **Who:** QA Head or Customer Admin.
- **Opens and clicks:** **Tasks** → the task → **Mark complete**.
- **Gate:** none.
- **Signed action?** No.
- **Status after:** the task is **Complete**, and the readiness score goes up. [VERIFY] whether a
  completed task can be reopened — the audit indicates it can't (checklist row 4).

### Step 3 — Schedule and score a practice drill
- **Who:** QA Head or Customer Admin.
- **Opens and clicks:** **Training** → **Schedule simulation** (gives it a title → **Scheduled**), then
  **Score & complete** (enters a score → **Completed**).
- **Signed action?** No.

### Step 4 — Close out the inspection
- **Who:** QA Head.
- **Opens and clicks:** **Complete Inspection** → chooses the **outcome** (required) → confirms.
- **Gate:** an outcome must be chosen.
- **Signed action?** No.
- **Status after:** the inspection is closed out.

## 4. The independence rules

None. This process has no separate-person requirements.

## 5. Signing & closing

**None.** Nothing here is a legally signed action; no step asks for a password.

## 6. Where it can stall

| What the user sees | Why | What to do |
|---|---|---|
| **I can open the screen but can't change anything** | Readiness is kept current by QA Head (and Customer Admin for some steps). | Everyone else views the picture. |
| **There's no "New Inspection" for me** | Only QA Head sets one up. | Ask your QA Head. |
| **I can't reopen a task I marked complete** | Completing a readiness task appears to be final. | [VERIFY] this in the live app (checklist row 4). |
| **"Complete Inspection" won't finish** | Closing out is QA Head's, and it needs an outcome. | Choose the outcome first. |

## 7. Statuses

**Readiness task**

| Status | What it means in practice |
|---|---|
| **Not Started** | Not done yet. |
| **Complete** | Done, and counted towards the readiness score. |

You may also see **Overdue** on a task whose due date has passed. [VERIFY] whether readiness tasks carry
due dates (checklist row 13).

**Practice drill**

| Status | What it means in practice |
|---|---|
| **Scheduled** | Booked, not yet run. |
| **Completed** | Run and scored. |
