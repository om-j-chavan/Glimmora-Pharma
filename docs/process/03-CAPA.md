# Process — CAPA (Corrective and Preventive Action)

## 1. What this process achieves

This process runs a corrective action from the moment it's raised to a signed close and, later, a check
that it worked. It makes sure the root cause is reviewed by someone other than the person who wrote it,
the corrective work is done and accepted, and the close is signed by someone independent. Sign-and-close
is a legally signed action, and the effectiveness check afterwards is signed too.

## 2. Who takes part

| Role | Raise | Fill | Assign | Review | Sign | Close | View only |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **QA Head** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| **Customer Admin** | | | | | | | ✓ |
| **Viewer** | | | | | | | ✓ |

> **The doer roles work here from My Work, not on the CAPA screen.** QA, CSV/Validation Lead, QC Lab
> Director, Regulatory Affairs, IT/CDO, and Operations Head don't open the CAPA screen at all. When a QA
> Head assigns them a corrective-action task, it appears in their **My Work**, and they carry it out
> there. Only QA Head and Customer Admin can open the CAPA screen, and Customer Admin can only view.

## 3. The process, step by step

### Step 1 — Raise the corrective action
- **Who:** QA Head.
- **Opens and clicks:** **CAPA Tracker** → the option to add one.
- **Fills in:** a **title** (a real summary, required), a **description** (a proper description,
  required), the **source**, and the **risk**. Often it's raised from a finding, a deviation, or an
  inspection observation, in which case much of the detail is carried across.
- **Gate:** none — this is the start.
- **Signed action?** No.
- **Status after:** **Open**.

### Step 2 — Record the root cause and start the work
- **Who:** QA Head.
- **Opens and clicks:** the corrective action → records the **root cause** in the plan.
- **Gate:** none.
- **Signed action?** No.
- **Status after:** moves to **In Progress** once the root cause is entered.

### Step 3 — Review the root cause
- **Who:** a QA Head who is **not** the person who raised this corrective action.
- **Opens and clicks:** the review area → marks the root cause **approved**, or sends it back, with a
  short **note** (required).
- **Gate:** the root cause has been recorded.
- **Signed action?** No.
- **Status after:** **In Progress**.

### Step 4 — Add and assign the corrective tasks
- **Who:** QA Head.
- **Opens and clicks:** the people-and-work area → adds a task → fills a **description** (required), an
  **owner**, and a **due date** (which can't be after the corrective action's own due date).
- **Gate:** the person you assign must be one of the doer roles (QA, CSV/Validation Lead, QC Lab
  Director, Regulatory Affairs, IT/CDO, Operations Head).
- **Signed action?** No.
- **Goes to:** the owner's **My Work**, and they're alerted.

### Step 5 — Do the corrective task
- **Who:** the assigned doer.
- **Opens and clicks:** **My Work** → the task → attaches evidence, adds notes → submits.
- **Gate:** the task is assigned to you.
- **Signed action?** No.
- **Goes to:** a QA Head to review.

### Step 6 — Review each person's work
- **Who:** QA Head.
- **Opens and clicks:** the task → **Accept**, or send it back with a reason.
- **Signed action?** No.
- **Status after:** the task is marked accepted, or returns to the doer's **My Work**.

### Step 7 — Get ready and submit for review
- **Who:** QA Head (or the person driving the corrective action).
- **Opens and clicks:** **Submit for review**, once the readiness checklist is complete:
  1. the **root cause** is approved,
  2. the **action-plan alignment** is reviewed,
  3. the **data-integrity check** is cleared — only when one applies,
  4. **all corrective tasks** are complete,
  5. **at least one evidence category** is answered,
  6. **at least one effectiveness measure** is defined.
- **Gate:** every item on that checklist. The app keeps the option unavailable and shows what's missing.
- **Signed action?** No.
- **Status after:** **Pending QA Review**.

### Step 8 — Sign and close
- **Who:** a QA Head who has **signing authority** and who is **not** the person who raised this
  corrective action.
- **Opens and clicks:** **Sign & Close** → writes a closing note → enters their **password** to sign.
- **Fills in:** a **closing note** (required) and the **password**.
- **Gate:** the corrective action is at **Pending QA Review**; every task is accepted or skipped; there
  is no unresolved concern in the discussion; you didn't raise this corrective action; you have signing
  authority.
- **Signed action?** **Yes — this asks for your password.**
- **Status after:** **Closed**.

### Step 9 — (Alternative to Step 8) Reject back for rework
- **Who:** QA Head.
- **Opens and clicks:** the reject option → writes a **reason** (required).
- **Gate:** the corrective action is at **Pending QA Review**.
- **Signed action?** No.
- **Status after:** back to **In Progress**, for the outstanding work to be redone and resubmitted.

### Step 10 — Record effectiveness (after closure)
- **Who:** someone with the right authority who is **not** the person who signed the closure.
- **Opens and clicks:** the closed corrective action → records whether it was effective, with notes
  (required) → enters their **password** to sign.
- **Gate:** the corrective action is closed. The app sets a date around 90 days on for this check.
- **Signed action?** **Yes — this asks for your password.**
- **Status after:** **Closed** (the effectiveness result is recorded against it).

## 4. The independence rules (who can't finish their own work)

- **You cannot review the root cause of a corrective action you raised** — a different colleague must
  review it.
- **You cannot sign closed a corrective action you raised** — a different QA Head must close it.
- **You cannot record the effectiveness check if you signed the closure** (or signed an earlier
  verification of it) — a different person must do the effectiveness check.

**[VERIFY] — older records.** For corrective actions raised before the original author was firmly
recorded, the app decides "who raised it" by matching **names**. Names are not a reliable way to tell
people apart, so on those older records the "must be a different person" check is weaker than on new
ones. Confirm who actually raised an older corrective action before relying on it to keep the sign-off
independent. This is a fix-the-app item for old records.

## 5. Signing & closing

Two actions here are **legally signed** and ask the signer for their **password**:

- **Sign & Close** — the QA Head confirms the closing note and that the corrective action is complete.
  It needs **signing authority**, and the signer must not be the person who raised the corrective
  action. The signature records who signed, when, and what they agreed to.
- **Record effectiveness** — the later check that the fix worked. It is signed the same way, by someone
  who did not sign the closure.

**If the password is wrong**, the action does not go through, nothing changes, and the attempt is
recorded. Enter the correct password and try again. (See the [VERIFY] in section 4 about how the
"different person" rule is checked on older records.)

## 6. Where it can stall

| What the user sees | Why | What to do |
|---|---|---|
| **I can't find CAPA in my menu** | The screen is for QA Head and Customer Admin only. | Do your corrective-action tasks from **My Work**. |
| **I can view but can't change anything** | You're a Customer Admin, who views corrective actions but doesn't author them. | The quality roles do the work. |
| **There's no option to raise one** | Only QA Head raises a corrective action. | Ask a QA Head. |
| **"Submit for review" is greyed out** | The readiness checklist isn't complete. | The screen lists what's missing — the root cause not approved, alignment not reviewed, the data-integrity check not cleared, tasks unfinished, no evidence answered, or no effectiveness measure. Complete those. |
| **I can't review the root cause** | You raised this corrective action. | A different colleague must review it. |
| **"Sign & Close" is greyed out — tasks** | Not every task is accepted or skipped. | Work through them first. |
| **"Sign & Close" is greyed out — a concern** | There's an unresolved concern in the discussion. | Resolve the concern, then close. |
| **"Sign & Close" is greyed out — it's yours** | You raised this corrective action. | A different QA Head must close it. |
| **"Sign & Close" is greyed out — signing** | You don't have signing authority. | Ask your Customer Admin to grant it (a signed change). |
| **I can't be assigned a task** | Only the doer roles can be assigned corrective tasks. | QA Head and admins assign the work rather than doing it. |
| **I can't edit after submitting** | Once submitted, it's locked while under review. | If it needs changes, a QA Head sends it back, which reopens it. |
| **My password was refused** | The signature didn't confirm. | Nothing changed and the attempt is recorded; enter the correct password. |

## 7. Statuses

| Status | What it means in practice |
|---|---|
| **Open** | Raised. The root cause hasn't been recorded yet. |
| **In Progress** | The root cause is in and the corrective work is under way. |
| **Pending QA Review** | Submitted, and a QA Head is reviewing it — ready to sign closed or send back. |
| **Closed** | A QA Head has signed and closed it. An effectiveness check follows around 90 days later. |
