# Chapter 5 — CAPAs

## 1. What this is for

A **CAPA** — a Corrective and Preventive Action — is the structured piece of work that fixes a problem
and stops it coming back. This screen is where a CAPA is raised, planned, worked by a team, reviewed,
and signed closed. It brings the root cause, the corrective actions, the evidence, and the sign-off
together in one place, with checks that make sure nothing is skipped.

## 2. Who uses it

**Only QA Head and Customer Admin can open the CAPA screen.** Everyone else does their part of a CAPA
from **My Work**, where their assigned pieces appear. QA Head runs the CAPA: raising it, reviewing the
root cause, assigning the corrective work, and signing it closed. Customer Admin can view CAPAs but
cannot create or change them. The people who carry out the corrective work — QA, CSV/Validation Lead,
QC Lab Director, Regulatory Affairs, IT/CDO, and Operations Head — do it through **My Work**.

## 3. The screens

**The CAPA list** shows each CAPA's reference, a short title, its **status** (see section 7), and its
owner. [VERIFY] the exact columns and filters on your screen.

**The CAPA detail** opens as a full page and gathers everything about the CAPA. You'll find:

- **The plan and root cause** — what the CAPA is for, and why the problem happened.
- **The people and their work** — the list of **action items** (the individual pieces of corrective
  work), who each is assigned to, and how each is progressing.
- **The review** — where QA Head reviews the root cause, checks the plan lines up with the problem,
  clears the data-integrity check where one applies, and records how effectiveness will be measured.
- **Evidence** — the supporting files, organised by category.
- **Discussion** — comments, including **concerns**, which are points that must be resolved before the
  CAPA can close.

[VERIFY] the exact names and arrangement of these sections on your screen.

## 4. How to…

### Raise a CAPA (QA Head)

1. From the CAPA list, select the option to add a CAPA.
2. Fill in the form:
   - **Title** — a short summary. Required.
   - **Description** — what the CAPA covers. Required, and it needs a real description, not a few
     words.
   - **Source** and **Risk** — where it came from and how serious it is. Required.
3. Confirm. The CAPA appears as **Open**.

A CAPA is often raised from a deviation, a finding, or an inspection rather than from scratch. When it
is, much of the detail is carried across for you.

### Record and review the root cause

1. Open the CAPA and record the **root cause** in the plan area. Once a root cause is entered, the
   CAPA moves to **In Progress**.
2. QA Head then reviews the root cause and marks it approved (or sends it back). A short note is
   required with the review.

The person who created the CAPA can't be the one who reviews its root cause — a different reviewer is
required so the review stays independent.

### Add and assign an action item (QA Head)

1. In the people-and-work area, add an **action item**.
2. Fill in what needs doing (a real description), who it's assigned to, and the due date. The due date
   can't be after the CAPA's own due date.
3. The person you assign it to must be one of the doer roles — QA, CSV/Validation Lead, QC Lab
   Director, Regulatory Affairs, IT/CDO, or Operations Head. QA Head and administrators assign the
   work; they don't carry it out.
4. The action item lands in that person's **My Work**.

### Complete an action item (the assignee, from My Work)

1. Open **My Work** and select the CAPA action item.
2. Add your notes and attach any evidence.
3. Submit it. It goes to QA Head to review.

### Review a person's completed work (QA Head)

For each completed action item you can:

- **Accept** it — you're satisfied it's done.
- **Send it back** — it needs more; give a short reason, and it returns to the person's **My Work**.

You can also, where needed, reassign an action item to someone else or skip one that no longer
applies, each with a short reason.

### Get the CAPA ready and submit for review

Before a CAPA can be submitted, a short **readiness checklist** must be complete. The app shows you
what's still outstanding and keeps the submit option unavailable until it's all done. The checklist is:

1. The **root cause** has been approved by QA.
2. The **action plan alignment** has been reviewed.
3. The **data-integrity check** has been cleared — only when one applies to this CAPA.
4. **All corrective actions** are complete.
5. **At least one evidence category** has been answered (either completed or marked not applicable).
6. **At least one effectiveness measure** has been defined.

When every item is met, select **Submit for review**. The CAPA moves to **Pending QA Review**.

### Sign and close the CAPA (QA Head)

1. Open the CAPA in **Pending QA Review**.
2. Select **Sign & Close**.
3. Write a short closing note and enter your **password** to sign.
4. The CAPA moves to **Closed**.

To sign a CAPA closed you need signing authority, and you can't be the person who created the CAPA.

### Record effectiveness (after closure)

After a CAPA is closed, its effectiveness is reviewed later (the app sets a date around 90 days on).
When that's due, open the closed CAPA, record whether it was effective, and enter your **password** to
sign. The person who does this review can't be the same person who signed the CAPA closed.

## 5. Why can't I…?

| What you see | Why, and what to do |
|---|---|
| **I can't find CAPA in my menu** | Only QA Head and Customer Admin see the CAPA screen. If you have CAPA work to do, it's waiting for you in **My Work**. |
| **I can view CAPAs but can't change anything** | As Customer Admin you can read CAPAs but not create or change them. Quality work belongs to the quality roles. |
| **There's no option to raise a CAPA** | Only QA Head raises a CAPA. |
| **"Submit for review" is greyed out** | The readiness checklist isn't complete. The app lists what's still missing — for example, the root cause not yet approved, the alignment not reviewed, the data-integrity check not cleared, some corrective actions not finished, no evidence answered, or no effectiveness measure defined. Complete those and the option opens. |
| **I can't review the root cause** | You created this CAPA, so you can't review its root cause — a different reviewer is required. This keeps the review independent. |
| **"Sign & Close" is greyed out — actions** | Not every corrective action has been accepted or skipped yet. Work through them first. |
| **"Sign & Close" is greyed out — a concern** | There's an unresolved concern in the discussion. A concern must be resolved before the CAPA can close. |
| **"Sign & Close" is greyed out — it's yours** | You can't sign closed a CAPA you created. A different QA Head must close it. |
| **"Sign & Close" is greyed out — signing** | You need signing authority to sign a CAPA closed. If you should have it, ask your Customer Admin. |
| **I can't be assigned an action item** | Only the doer roles can be assigned corrective work. QA Head and administrators assign the work rather than carrying it out. |
| **I can't edit the CAPA any more** | Once a CAPA is submitted for review, it's locked while QA Head reviews it. If it needs changes, QA Head can send it back, which reopens it for work. |

## 6. What happens next

- **When you assign an action item** (or reassign or nudge one), the person gets an alert and it
  appears in their **My Work**.
- **When you send work back for rework**, or **reject the CAPA back for more work**, the people
  affected are alerted and their pieces return to their **My Work**.
- **When you sign the CAPA closed**, its owner is told it's closed.

Submitting a CAPA for review doesn't send an alert — QA Head watches the CAPA list for what's waiting.

## 7. Statuses

| Status | What it means in practice |
|---|---|
| **Open** | The CAPA has been raised. The root cause hasn't been recorded yet. |
| **In Progress** | The root cause is in and the corrective work is under way. |
| **Pending QA Review** | The CAPA has been submitted and QA Head is reviewing it, ready to sign closed or send back. |
| **Closed** | QA Head has signed and closed it. An effectiveness review follows later. |
