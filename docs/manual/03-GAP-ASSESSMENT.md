# Chapter 3 — Gap Assessment & Findings

## 1. What this is for

A **finding** is a gap between what a rule or standard requires and what your organisation does today.
This screen is where you record a finding, work it, and take it to a verified close. It keeps each gap
visible, owned, and backed by evidence until someone independent confirms it's resolved.

## 2. Who uses it

Most working roles use this screen: QA Head, QA, CSV/Validation Lead, Regulatory Affairs, QC Lab
Director, IT/CDO, and Operations Head can all raise and work findings. QA Head also assigns, reviews,
and closes them. Customer Admin and Viewer can read findings but cannot create or change them.

## 3. The screens

The Gap Assessment area has three views you switch between at the top.

**Summary** — an overview of your findings: how many are open, and how they break down. Use it to see
where attention is needed at a glance. [VERIFY] the exact counts and charts shown here.

**Register** — the working list of findings. This is where you spend most of your time.

- **Columns** you'll see include the finding's reference, a short title, its **severity** (Critical,
  High, Medium, or Low — how serious the gap is), its **status** (where it is in its life — see
  section 7), its owner, and its target date. [VERIFY] the exact column set on your screen.
- **Filters and search** let you narrow the list — for example, to open findings, or a particular
  severity. [VERIFY] the exact filters available.
- Selecting a row opens the finding's detail, where you do everything below.

**Evidence** — a view of the documents attached to findings. Selecting an item takes you to the
finding it belongs to.

From a finding's detail you can, depending on your role and where the finding is: record the root
cause, add or edit details, attach a document, assign it (QA Head), raise a CAPA from it (QA Head),
and review or close it (QA Head).

## 4. How to…

### Report a gap

1. In the **Register** view, select **Report Gap** at the top.
2. Fill in the form:
   - **Requirement** — what the rule or standard requires. This is required and needs a real
     sentence, not a couple of words.
   - **Area** — the area the gap sits in. Required.
   - **Severity** — Critical, High, Medium, or Low. Required.
   - **Target date** — when you expect it resolved. Required, and it can't be in the past.
   - If your role covers more than one site, pick the **site**. If you work at a single site, the app
     sets it for you and you won't see this choice.
3. Optionally attach a supporting document.
4. Select the confirm button. The button stays unavailable until the required entries are filled in.
5. You'll see a short "Finding logged" confirmation, and the finding appears in the Register as
   **Open**, owned by you.

### Record the root cause

1. Open the finding from the Register.
2. Find the **Root Cause** section.
3. Choose how you worked it out, and write the root cause.
4. If the finding already has a root cause and you're changing it, you must give a reason of at least
   a few words. On a first entry, no reason is needed.
5. Save. You'll see a confirmation and the root cause now shows on the finding.

You can record the root cause if you raised the finding — but only up until QA assigns it to someone.
After that, QA Head records or changes it. QA Head can always record it.

### Assign a gap to someone (QA Head)

1. Open the finding.
2. In the disposition area, choose the person to assign it to, then select the assign button.
3. You can't assign a finding to yourself. The person you pick must be an active member of your site.
4. The finding moves to **In Progress** and lands in that person's **My Work**.

Assigning this way is for **Low** severity findings. For High, Medium, and Critical findings, raise a
CAPA instead (below).

### Raise a CAPA from a gap (QA Head)

1. Open the finding.
2. Select **Raise CAPA**.
3. Confirm the details and create the CAPA.
4. The gap is now **locked** to the CAPA — you continue the work in the CAPA, and the finding closes
   automatically when the CAPA is signed and closed.

### Submit your assigned gap for review (from My Work)

If a gap was assigned to you, you work and submit it from **My Work**, not from the Gap Assessment
screen.

1. Open **My Work** and select the finding.
2. Attach any evidence and add your notes (at least a short sentence).
3. Select **Submit to QA**.
4. The finding moves to **Submitted** and goes to QA Head to review.

### Review a submitted gap (QA Head)

1. Open the finding.
2. In the review area you have two choices:
   - **Accept & close** — you're satisfied. The finding moves to **Closed**.
   - **Send for rework** — it needs more. Give a short reason. The finding moves to **Rework** and
     goes back to the person who did it.

## 5. Why can't I…?

| What you see | Why, and what to do |
|---|---|
| **No "Report Gap" button** | Your role can't raise findings. Viewers and Customer Admins can read findings but not create them. Ask a colleague in a working role, or your QA Head. |
| **I can change the details but not the severity or status** | As the person who raised the finding, you can correct its details, but severity and status are QA judgments. Ask your QA Head to change them. |
| **I can't edit the finding at all** | It's likely closed, or a CAPA has been raised from it (which locks it), or it isn't one you raised or were assigned. Continue the work in the linked CAPA if there is one. |
| **The Root Cause section is read-only** | Once QA assigns the finding to someone, only QA Head can change the root cause — the work has been handed off. It's also read-only once a CAPA has been raised. |
| **"Accept & close" is greyed out — no root cause** | A finding can't close without a root cause. Record the root cause first (there's a link to that section), then close. |
| **"Accept & close" is greyed out — you recorded the root cause** | You can't close a finding when you recorded its root cause — ask a colleague to close it. This keeps the review independent. |
| **"Accept & close" is greyed out — you did the work** | You can't review a finding that was assigned to you. A different QA Head must review it. |
| **I can't assign the finding to myself** | You can't assign a finding to yourself — assign it to someone else so the work and the review stay separate. |
| **"Assign" only appears for some findings** | Assignment is for Low severity findings. For higher severities, raise a CAPA instead. |
| **There's no "Submit" on the Gap screen** | If a gap was assigned to you, you submit it from **My Work**, not from here. |

## 6. What happens next

- **When you assign a finding**, the person you assigned it to gets an alert, and it appears in their
  **My Work**.
- **When you accept and close a finding**, the person who did the work is told it was accepted and
  closed.
- **When you send a finding back for rework**, that person is alerted and the finding returns to their
  **My Work** with your reason.

Raising a finding, recording a root cause, and attaching evidence don't send an alert. QA Head sees
new and submitted findings by looking at the Register.

## 7. Statuses

| Status | What it means in practice |
|---|---|
| **Open** | The finding has been raised. No one is working it yet. |
| **In Progress** | It's been assigned to someone (or a CAPA has been raised from it) and work is under way. |
| **Submitted** | The person who did the work has sent it to QA Head for review. |
| **Rework** | QA Head sent it back for more work. It returns to the person who did it, who addresses the feedback and resubmits. |
| **Closed** | The gap is resolved and verified by QA Head. This is the end of the line. |
