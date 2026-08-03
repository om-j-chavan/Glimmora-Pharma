# Chapter 4 — Deviations

## 1. What this is for

A **deviation** is something that happened differently from the approved plan or procedure. This
screen is where you report a deviation, investigate its root cause, decide whether a CAPA is needed,
and close it with a signature. It keeps each deviation moving through a controlled path where the
person who reports, the person who investigates, and the person who signs it closed are kept separate.

## 2. Who uses it

QA Head, QA, CSV/Validation Lead, Regulatory Affairs, QC Lab Director, IT/CDO, and Operations Head can
all report deviations. QA Head runs the decisions — starting the investigation, deciding on a CAPA,
and closing or rejecting. The investigation itself can be done by any of the working roles, as long as
it isn't the person who reported it. Customer Admin and Viewer can read deviations but not change them.

## 3. The screens

The Deviation area opens as a list of deviations. Selecting one opens its detail, where the whole life
of the deviation lives in one place.

**The list** shows each deviation's reference, a short title, its **severity** and **priority** (how
serious and how urgent), its **status** (see section 7), and who reported it. [VERIFY] the exact
columns and any filters on your screen.

**The detail** brings together:

- The core report — what happened, the area, the immediate action taken.
- The **Investigation** section — where the root cause is recorded.
- The **CAPA decision** — whether a CAPA is needed, with the reason.
- **Documents** — supporting files attached by the person who reported it.
- For low-priority deviations, a **task** area where a specific person is asked to do a piece of work
  and submit it back.

What you can do here depends on your role and where the deviation is in its life.

## 4. How to…

### Report a deviation

1. Select **Report Deviation** at the top of the list.
2. Fill in the form:
   - **Title** — a short summary. Required.
   - **Description** — what happened. Required.
   - **Type** — planned or unplanned. Required.
   - **Category** and **Severity** — required.
   - **Area** — where it happened. Required.
   - **Immediate action** — what you did straight away. Required.
   - **Due date** — required, and not in the past.
   - If your role covers more than one site, pick the **site**; otherwise the app sets it for you.
3. Optionally attach a supporting document.
4. Select confirm. The button stays unavailable until the required entries are filled in.
5. You'll see a short "reported" confirmation, and the deviation appears as **Open**.

### Attach a supporting document (the person who reported it)

1. Open the deviation.
2. In the Documents area, add your file.

Only the person who reported the deviation attaches its evidence. QA reviews the evidence rather than
adding it.

### Start the investigation (QA Head)

1. Open an **Open** deviation.
2. Select **Start Investigation**. The deviation moves to **Under Investigation**.

### Record the investigation and root cause

1. Open the deviation (now Under Investigation).
2. In the **Investigation** section, choose how you worked out the cause and write the root cause.
   Both are required.
3. Save. When the investigation is complete, the deviation moves to **Pending QA Review**.

The investigation must be done by someone other than the person who reported the deviation.

### Get AI help with the root cause analysis

The **Investigation** section carries an **AI RCA** button. It reads this deviation — the description,
immediate action, severity, area, the names of any attached documents, and anything already written in
the RCA — together with similar past deviations from your own site, and comes back with:

- probable root causes, ranked, with the evidence behind each
- contributing factors
- recommended next investigative steps
- candidate corrective and preventive actions
- **information and evidence the investigation is still missing**

Everything it returns is marked as AI-generated and is advisory. Review it, edit anything you disagree
with, then select **Apply to RCA** to drop the draft into the RCA form. If the form already contains
your analysis, you are asked to confirm before it is replaced. Applying fills the form only — nothing
is recorded until you select **Save RCA** yourself, and the form stays marked as AI-drafted until you do.

You can read the analysis even when you can't author the RCA (for example, if you reported the
deviation); only **Apply to RCA** is withheld.

### Make the CAPA decision (QA Head)

1. Open the deviation once the investigation is complete.
2. In the **CAPA decision** area, choose whether a CAPA is required, and give a short reason.
3. Save.

You can make this decision only if you didn't report the deviation and didn't investigate it.

### Raise a CAPA (QA Head)

1. Open the deviation.
2. Select the option to raise a CAPA and confirm.
3. The deviation moves to **CAPA Pending** and stays linked to the CAPA. It waits there until the CAPA
   is closed, then returns for you to sign it closed.

### Assign a low-priority task (QA Head)

1. Open a low-priority deviation.
2. Select **Assign Task**, choose the person, and write a short message about what's needed.
3. The task lands in that person's **My Work**. They do it and submit it back to you.

### Sign and close a deviation (QA Head)

1. Open the deviation when it's ready to close.
2. Select **Sign & Close**.
3. Write a short closing note and enter your **password** to sign.
4. The deviation moves to **Closed**.

For a **Critical** deviation, you can't close it until a CAPA has been raised and linked to it.

## 5. Why can't I…?

| What you see | Why, and what to do |
|---|---|
| **No "Report Deviation" button** | Your role can't report deviations. Viewers and Customer Admins can read them but not raise them. |
| **I can't attach a document** | Only the person who reported the deviation attaches its evidence. If you're QA, you review the evidence rather than adding it. |
| **No "Start Investigation" button** | Only QA Head starts an investigation, and only while the deviation is Open. |
| **I can't record the investigation** | You can't investigate a deviation you reported yourself — ask a colleague to investigate it. This keeps the investigation independent. |
| **I can't make the CAPA decision** | The CAPA decision is QA Head's, and it can't be made by the person who reported or investigated the deviation. |
| **"Sign & Close" is greyed out — not ready** | The investigation isn't complete yet, or (for a Critical deviation) no CAPA has been raised and linked. Finish the investigation, or raise the CAPA first. |
| **"Sign & Close" is greyed out — it's yours** | You can't sign a deviation closed if you reported it, investigated it, or were the person assigned its task. A different QA Head must close it. This keeps the sign-off independent. |
| **I can't reject the deviation** | A deviation can only be rejected while it's under QA review. |
| **"Assign Task" isn't available** | Tasks are for low-priority deviations. For higher priorities, raise a CAPA instead. |

## 6. What happens next

- **When you assign a task**, the person gets an alert and it appears in their **My Work**.
- **When they submit the task back**, you (the QA Head who assigned it) are alerted.
- **When you send a task back for rework**, that person is alerted and the task returns to their
  **My Work**.

The main steps of a deviation's life — starting the investigation, recording the root cause, making
the CAPA decision, closing — don't send an alert. QA Head keeps an eye on the deviation list to see
what's waiting.

## 7. Statuses

| Status | What it means in practice |
|---|---|
| **Open** | Reported. The investigation hasn't started. |
| **Under Investigation** | The root cause is being worked out. |
| **Pending QA Review** | The investigation is complete and QA Head is reviewing it, ready to close or reject. |
| **CAPA Pending** | A CAPA has been raised. The deviation stays open and linked until that CAPA is closed. |
| **Closed** | QA Head is satisfied and has signed it closed. This is the end of the line. |
| **Rejected** | QA Head has rejected it. [VERIFY] the on-screen wording suggests it goes back to investigation, but in practice a rejected deviation does not move on — confirm the intended behaviour in the live app before relying on this status. |
