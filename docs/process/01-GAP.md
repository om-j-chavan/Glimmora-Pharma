# Process — Gap Assessment (Findings)

## 1. What this process achieves

This process takes a compliance gap from the moment it's spotted to a verified close. It makes sure
every finding has a root cause, an owner who does the work, and an independent review before it's shut.
The people who raise, work, and close a finding are kept separate so no one signs off their own work.

## 2. Who takes part

| Role | Raise | Fill | Assign | Review | Sign | Close | View only |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **QA Head** | ✓ | ✓ (full) | ✓ | ✓ | — | ✓ | |
| **QA** | ✓ | ✓ (own, limited) | | | — | | |
| **CSV / Validation Lead** | ✓ | ✓ (own, limited) | | | — | | |
| **Regulatory Affairs** | ✓ | ✓ (own, limited) | | | — | | |
| **QC Lab Director** | ✓ | ✓ (own, limited) | | | — | | |
| **IT / CDO** | ✓ | ✓ (own, limited) | | | — | | |
| **Operations Head** | ✓ | ✓ (own, limited) | | | — | | |
| **Customer Admin** | | | | | — | | ✓ |
| **Viewer** | | | | | — | | ✓ |

- **Fill (full)** — QA Head can change any of a finding's details, including its severity.
- **Fill (own, limited)** — the person who raised a finding can correct its own details (the
  requirement, the area, the target date, the evidence link, and the root cause) but **not** its
  severity or status. [VERIFY] whether the raiser can change the "area" — the audit is not certain the
  screen allows it even though the rules suggest it.
- **Sign** — findings have **no** password-signed step (see section 5), so this column is not used here.
- The person a finding is **assigned** to is one of the working roles (not an administrator or Viewer,
  and not the person assigning it). They do the work from **My Work**.

## 3. The process, step by step

### Step 1 — Raise the finding
- **Who:** any working role (QA Head, QA, CSV/Validation Lead, Regulatory Affairs, QC Lab Director,
  IT/CDO, Operations Head).
- **Opens and clicks:** **Gap Assessment** → the **Register** view → **Report Gap**.
- **Fills in:** the **requirement** (a real sentence, required), the **area** (required), the
  **severity** (Critical / High / Medium / Low, required), and the **target date** (required, not in
  the past). If their role covers more than one site, they pick the **site**; otherwise the app sets it.
- **Gate:** none — this is the start.
- **Signed action?** No.
- **Status after:** **Open**. The raiser owns it.
- **Goes to:** the raiser keeps it. QA Head can see it in the register. Most other people can't see it.

### Step 2 — Record the root cause
- **Who:** the person who raised it (until it's assigned), or QA Head at any time.
- **Opens and clicks:** the finding → the **Root Cause** section → records how it was worked out and the
  root cause → saves.
- **Fills in:** how the cause was worked out, and the **root cause** text (required). If the finding
  already has a root cause and this is a change, a short **reason** is required; a first entry needs no
  reason.
- **Gate:** the finding isn't closed, and no corrective action has been raised from it. The raiser may
  do this **only until the finding is assigned** — after that, only QA Head can.
- **Signed action?** No.
- **Status after:** unchanged.
- **Goes to:** stays with the finding. The root cause now shows on it.

### Step 3 — Assign the finding (Low severity)
- **Who:** QA Head only.
- **Opens and clicks:** the finding → chooses a person → **Assign**.
- **Fills in:** the person to assign it to.
- **Gate:** the finding is **Low** severity; the person is active working staff at the site; you can't
  assign it to yourself; the finding isn't closed or locked. (For High, Medium, and Critical findings,
  QA Head raises a corrective action instead — see the alternative below.)
- **Signed action?** No.
- **Status after:** **In Progress**.
- **Goes to:** the assignee. It appears in their **My Work**, and they're alerted.

### Step 4 — Do the work and submit
- **Who:** the assignee.
- **Opens and clicks:** **My Work** → the task → attaches evidence, adds notes → **Submit to QA**.
- **Fills in:** work **notes** (at least a short sentence, required to submit), plus any evidence.
- **Gate:** the task is assigned to you, and the finding isn't locked.
- **Signed action?** No.
- **Status after:** **Submitted**.
- **Goes to:** QA Head. There's **no alert on submit** — QA Head finds submitted findings by opening the
  register and looking at the ones marked **Submitted**.

### Step 5 — Review and close
- **Who:** QA Head — but not the person who did the work.
- **Opens and clicks:** the finding → **Accept & close**, or **Send for rework** with a reason.
- **Fills in:** for rework, a short **reason** (required).
- **Gate:** the finding is **Submitted**; the reviewer is not the assignee; to close, a root cause must
  already exist and the person closing must not be the one who recorded it.
- **Signed action?** No.
- **Status after:** **Closed** (accepted) or **Rework** (sent back).
- **Goes to:** on accept, the person who did the work is told it was closed. On rework, it returns to
  their **My Work** as **Returned**, with the reason, and they resubmit (back to Step 4).

### Alternative to Steps 3–5 — Raise a corrective action
- **Who:** QA Head.
- **Opens and clicks:** the finding → **Raise CAPA** → confirms.
- **Gate:** used for the more serious findings, and the usual route for High, Medium, and Critical.
- **Signed action?** No (raising it isn't signed; closing the corrective action later is — see the CAPA
  process).
- **Status after:** the finding is **locked** to the corrective action and moves to **In Progress**.
  Work continues in the corrective action, and the finding **closes automatically** when that
  corrective action is signed closed.

## 4. The independence rules (who can't finish their own work)

- **The person the work was assigned to cannot review or close their own work** — a different QA Head
  must review it.
- **The person who recorded the root cause cannot be the one who closes the finding** — a different
  colleague must close it. In practice the raiser records the root cause and a QA Head closes, so there's
  no clash; but if a QA Head records the root cause, a different QA Head has to close it.
- **Once the finding is assigned, the person who raised it can no longer change the root cause** — from
  that point only QA Head can, because the work has been handed off.

## 5. Signing & closing

**Findings are not password-signed.** Closing a finding is a QA Head judgment and is recorded in the
history, but it does **not** ask for a password. (The password-signed actions live in the Deviations,
CAPA, and Inspections processes.) The control that keeps a close honest here is the independence rule in
section 4 — a root cause must exist, and the person closing must not be the one who recorded it.

## 6. Where it can stall

| What the user sees | Why | What to do |
|---|---|---|
| **No "Report Gap" button** | Their role can't raise findings. | Viewers and Customer Admins view findings but don't raise them; ask a working role or QA Head. |
| **Can't change severity or status** | Those are QA judgments. | As the raiser you can correct the details; ask QA Head to change severity or status. |
| **The Root Cause section is read-only** | The finding is assigned (only QA Head changes it now), or a corrective action has been raised from it (which locks it). | Continue in the linked corrective action if there is one; otherwise ask QA Head. |
| **"Accept & close" is greyed out — no root cause** | A finding can't close without a root cause. | Record the root cause first, then close. |
| **"Accept & close" is greyed out — you recorded the root cause** | The person who recorded the root cause can't close the finding. | Ask a different colleague to close it — this keeps the review independent. |
| **"Accept & close" is greyed out — you did the work** | You can't review a finding assigned to you. | A different QA Head must review it. |
| **Can't assign the finding to yourself** | The work and the review must stay with different people. | Assign it to someone else. |
| **"Assign" only appears for some findings** | Assignment is for Low severity. | For higher severities, raise a corrective action instead. |
| **No "Submit" on the Gap screen** | Assignees submit from My Work. | Open **My Work** and submit the finding from there. |

## 7. Statuses

| Status | What it means in practice |
|---|---|
| **Open** | Raised. No one is working it yet. |
| **In Progress** | Assigned to someone (or a corrective action has been raised from it) and work is under way. |
| **Submitted** | The person who did the work has sent it to QA Head for review. |
| **Rework** | QA Head sent it back for more work; it returns to the person who did it. |
| **Closed** | Resolved and verified by QA Head. This is the end of the line. |
