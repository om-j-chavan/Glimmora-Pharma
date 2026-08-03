# Process — Deviations

## 1. What this process achieves

This process takes a deviation from the moment it's reported to a signed close. It makes sure the
deviation is investigated, that a decision is made about whether a corrective action is needed, and that
the close is signed by someone independent of the work. It carries the heaviest independence rules in
the app: the reporter, the investigator, and the person who signs it closed must all be different people.

## 2. Who takes part

| Role | Raise | Fill (investigate) | Assign | Review | Sign | Close | View only |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **QA Head** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| **QA** | ✓ | ✓* | | | | | |
| **CSV / Validation Lead** | ✓ | ✓* | | | | | |
| **Regulatory Affairs** | ✓ | ✓* | | | | | |
| **QC Lab Director** | ✓ | ✓* | | | | | |
| **IT / CDO** | ✓ | ✓* | | | | | |
| **Operations Head** | ✓ | ✓* | | | | | |
| **Customer Admin** | | | | | | | ✓ |
| **Viewer** | | | | | | | ✓ |

**✓\*** — the investigation may be recorded by any working role *except the person who reported the
deviation*. In practice, only a QA Head (who can see every record) or a person the deviation was handed
to can open it to investigate — so this usually falls to a QA Head.

> **Closing genuinely needs a different person from the earlier steps.** Even though Assign, Review,
> Sign, and Close all belong to QA Head, the *same* QA Head cannot carry one deviation through every
> step. Whoever reported it, investigated it, or worked a task on it is barred from signing it closed —
> so a deviation is finished by a QA Head who is clear of all of those. In a team with a single QA Head,
> a **second** QA Head is needed to close.

## 3. The process, step by step

### Step 1 — Report the deviation
- **Who:** any working role (QA Head, QA, CSV/Validation Lead, Regulatory Affairs, QC Lab Director,
  IT/CDO, Operations Head).
- **Opens and clicks:** **Deviation Management** → **Report Deviation**.
- **Fills in:** **title**, **description**, **type** (planned or unplanned), **category**, **severity**,
  **area**, **immediate action**, and **due date** (not in the past). All required. Multi-site roles pick
  the **site**; others have it set for them.
- **Gate:** none — this is the start.
- **Signed action?** No.
- **Status after:** **Open**. The reporter and the QA Heads can see it; most others cannot.

### Step 2 — Attach supporting documents (optional)
- **Who:** the person who reported it — **only** the reporter.
- **Opens and clicks:** the deviation → the documents area → adds a file.
- **Gate:** you reported this deviation.
- **Signed action?** No.
- **Status after:** unchanged. (QA reviews the evidence later; QA does not upload it here.)

### Step 3 — Start the investigation
- **Who:** QA Head.
- **Opens and clicks:** the deviation → **Start Investigation**.
- **Gate:** the deviation is **Open**.
- **Signed action?** No.
- **Status after:** **Under Investigation**.

### Step 4 — Record the investigation and root cause
- **Who:** a working role who is **not** the reporter — in practice a QA Head.
- **Opens and clicks:** the deviation → the Investigation section → chooses how the cause was worked out
  and writes the **root cause** → saves. Both required.
- **Gate:** you did not report this deviation; it is under investigation and not closed.
- **Signed action?** No.
- **Status after:** **Pending QA Review**.
- **Goes to:** a QA Head to decide on a corrective action and, in time, to close it. There's no work-list
  alert — the deviation is picked up from the deviation list at **Pending QA Review**.

### Step 5 — Make the corrective-action decision
- **Who:** a QA Head who is **not** the reporter and **not** the investigator.
- **Opens and clicks:** the deviation → the corrective-action decision area → chooses whether one is
  required and writes a short **reason** (required).
- **Gate:** the investigation is complete; you didn't report or investigate this deviation.
- **Signed action?** No.
- **Status after:** **Pending QA Review** (unchanged).
- **If a corrective action is required:** the QA Head raises one. The deviation moves to **CAPA Pending**
  and waits, linked, until that corrective action is signed closed — then it returns to **Pending QA
  Review** to be closed.

### Step 6 — (Low-priority alternative) Assign a task
- **Who:** QA Head.
- **Opens and clicks:** a low-priority deviation → **Assign Task** → chooses a person and writes a short
  message (required).
- **Gate:** the deviation is low priority; the person is active working staff.
- **Signed action?** No.
- **Goes to:** the person's **My Work**, and they're alerted. They do it and submit it back; a QA Head
  who is **not** that assignee reviews it and can send it back for rework.

### Step 7 — Sign and close
- **Who:** a QA Head who is **not** the reporter, **not** the investigator, and **not** a task assignee.
- **Opens and clicks:** the deviation → **Sign & Close** → writes a closing note → enters their
  **password** to sign.
- **Fills in:** a **closing note** (required) and the **password**.
- **Gate:** the investigation is complete / under QA review (or, for one that was CAPA Pending, the
  linked corrective action is closed). For a **Critical** deviation, a corrective action must have been
  raised and linked to it. And you must be clear of every earlier step.
- **Signed action?** **Yes — this asks for your password.**
- **Status after:** **Closed**.

### Step 8 — Reject (send back) — [VERIFY]
- **Who:** QA Head, with their **password**.
- **Opens and clicks:** the deviation → **Reject** → writes a reason → enters their **password**.
- **Gate:** the deviation is at **Pending QA Review**.
- **Signed action?** **Yes — this asks for your password.**
- **Status after:** **[VERIFY] — the screen and the outcome disagree.** The on-screen wording says a
  rejected deviation is *"returned to investigation,"* but in practice it reaches a terminal **Rejected**
  state and does not move on. **Do not rely on either reading until it's confirmed in the live app.**
  This is a fix-the-app item, not a wording choice — flag it to the build team.

## 4. The independence rules (who can't finish their own work)

Stated plainly, in the order they bite:

- **You cannot investigate a deviation if you reported it** — someone else must investigate it.
- **You cannot decide on, or raise, the corrective action if you reported the deviation or investigated
  it** — a different QA Head must.
- **You cannot sign a deviation closed if you reported it, investigated it, or worked a task on it** — a
  different QA Head must close it.

Together these mean a single deviation passes through at least two, and often three, different people
before it can be closed.

## 5. Signing & closing

Two actions here are **legally signed** and ask the QA Head for their **password**:

- **Sign & Close** — the QA Head confirms the closing note and that they're satisfied the deviation is
  resolved. The signature records who signed, when, and what they were agreeing to.
- **Reject** — the QA Head confirms the reason for sending it back. It is signed the same way.
  ([VERIFY] where a rejected deviation actually ends up — see Step 8.)

**If the password is wrong**, the action does not go through, nothing changes, and the attempt is
recorded. Enter the correct password and try again.

## 6. Where it can stall

| What the user sees | Why | What to do |
|---|---|---|
| **No "Report Deviation" button** | Their role can't report deviations. | Viewers and Customer Admins view but don't report. |
| **I can't attach a document** | Only the reporter attaches a deviation's evidence. | If you're QA, you review the evidence rather than adding it. |
| **No "Start Investigation" button** | Only QA Head starts one, and only while it's Open. | Ask a QA Head. |
| **I can't record the investigation** | You reported this deviation. | Someone else must investigate it — this keeps the investigation independent. |
| **I can't make the corrective-action decision** | You reported or investigated this deviation. | A different QA Head must decide. |
| **"Sign & Close" is greyed out — not ready** | The investigation isn't complete, or (for a Critical) no corrective action is linked yet. | Finish the investigation, or raise and link the corrective action first. |
| **"Sign & Close" is greyed out — it's yours** | You reported it, investigated it, or worked its task. | A different QA Head must close it. |
| **I can't reject the deviation** | Rejecting is only possible while it's under QA review. | Wait until it reaches Pending QA Review. |
| **My password was refused** | The signature didn't confirm. | Nothing changed and the attempt is recorded; enter the correct password. |

## 7. Statuses

| Status | What it means in practice |
|---|---|
| **Open** | Reported. The investigation hasn't started. |
| **Under Investigation** | The root cause is being worked out. |
| **Pending QA Review** | The investigation is complete and a QA Head is reviewing it, ready to close or reject. |
| **CAPA Pending** | A corrective action has been raised; the deviation stays open and linked until that corrective action is closed. |
| **Closed** | A QA Head is satisfied and has signed it closed. The end of the line. |
| **Rejected** | A QA Head has rejected it. **[VERIFY]** — the screen says it's returned to investigation, but in practice it appears to be a terminal state with no further step. Confirm the real outcome in the live app. |
