# Chapter 6 — Inspections & Regulatory Responses

## 1. What this is for

This screen is where you manage a regulatory inspection from start to finish. You record the
inspection and its observations, investigate each one, raise a corrective action where needed, draft
and sign the formal response, and record what the regulator decided. It keeps the whole inspection —
observations, root causes, response, and sign-off — in one controlled place.

## 2. Who uses it

QA Head and Regulatory Affairs set up inspections and sign the formal response. The working roles — QA,
CSV/Validation Lead, QC Lab Director, IT/CDO, and Operations Head — can add observations, investigate
them, and draft responses. Raising a corrective action from an observation is QA Head's. Customer Admin
and Viewer can read inspections but not change them.

## 3. The screens

The area opens as a list of inspection events. Selecting one opens its detail, arranged in tabs.
[VERIFY] the exact tab names on your screen.

- **Overview** — the inspection's key facts: the regulator, the dates, the response deadline, and who
  owns it internally.
- **Observations** — the list of what the regulator raised. Each observation has its own text,
  a **severity**, and a **status** (see section 7).
- **Investigation** — where the root cause of each observation is recorded.
- **Response** — where the formal response is drafted, then signed and submitted, in ordered steps.
- **History** — the record of who did what on this inspection. [VERIFY] the exact name of this tab.

An inspection also moves through **stages** — from intake, to investigation, to response, to outcome.
A banner shows the current stage and whose turn it is.

## 4. How to…

### Register an inspection (QA Head or Regulatory Affairs)

1. Select **Register Event** at the top of the list.
2. Fill in the form: the inspection **type**, the **site**, the **inspection date**, the **response
   deadline**, and the internal **owner**. These are required.
3. Confirm. The inspection appears as **Open**.

### Add observations

1. Open the inspection and go to **Observations**.
2. Select **Add observation**.
3. Enter the observation **text** (a full sentence), its **number**, and its **severity**. The area
   and the regulation reference are optional.
4. Save. The observation appears as **Open**.

[VERIFY] whether your screen also offers importing observations from an inspection document.

### Record the root cause of an observation

1. Go to **Investigation** and open the observation.
2. Choose how you worked out the cause, and write the **root cause**.
3. Save.

### Raise a corrective action from an observation (QA Head)

1. Open the observation.
2. Select the option to raise a corrective action.
3. Fill in the owner and due date, and confirm. A CAPA is created and linked to the observation, which
   now shows as **CAPA Linked**. (See Chapter 5 for how the CAPA is then run.)

### Draft the response

1. Go to **Response**.
2. Write the draft. You can only start the draft once **every** observation has both a root cause and a
   linked corrective action.
3. Save. The inspection shows as **Response Drafted**.

### Sign and submit the response (QA Head or Regulatory Affairs)

1. In **Response**, work through the readiness steps until they're all met:
   - every observation has a root cause,
   - every observation has a linked corrective action,
   - at least one response document is attached,
   - the response draft is written,
   - all commitments are complete or withdrawn. [VERIFY] the word "commitments" on your screen.
2. Select **Sign & Submit**.
3. Confirm the meaning of your signature and enter your **password**.
4. The inspection moves to **Response Submitted**.

### Record the outcome (QA Head or Regulatory Affairs)

1. When the regulator responds, open the inspection.
2. Select **Record Outcome**, choose the result, and enter your **password** to sign.
3. The inspection moves to the matching outcome status (see section 7).

## 5. Why can't I…?

| What you see | Why, and what to do |
|---|---|
| **"Register Event" doesn't work for me** | Only QA Head and Regulatory Affairs can create an inspection. Ask one of them to set it up. |
| **I can't start the response draft** | The draft stays locked until every observation has both a root cause and a linked corrective action. Complete those first. |
| **"Sign & Submit" is greyed out** | The readiness steps aren't all met — for example, a missing root cause or corrective action, no response document, or an open commitment. The screen shows what's outstanding. |
| **I can't change anything on the inspection** | Once the response is submitted, the whole inspection is locked. It's now a signed, submitted record. |
| **I raised the observations but can't sign the response** | Signing and submitting the response is reserved for QA Head and Regulatory Affairs, because it's a signed action. [VERIFY] the on-screen note, which may mention only QA Head even though Regulatory Affairs can also sign. |
| **I can't raise the corrective action from an observation** | Only QA Head can raise a corrective action. Ask your QA Head. |

## 6. What happens next

- **When you raise a corrective action from an observation**, a CAPA is created and linked; from there
  it runs like any other CAPA (Chapter 5), and its owner is alerted.
- **As a deadline approaches**, the app shows you a reminder so the response isn't missed.
- Moving an inspection between stages doesn't send a direct alert — the current stage and whose turn it
  is are shown on the inspection's banner, so check there.

## 7. Statuses

**Inspection statuses**

| Status | What it means in practice |
|---|---|
| **Open** | The inspection has been recorded. Work hasn't started. |
| **Response Drafted** | A draft response has been written. |
| **Response Submitted** | The signed response has been submitted to the regulator. |
| **FDA Acknowledged** | The regulator has confirmed receipt. |
| **Closed** | The regulator is satisfied and no further action is needed. |
| **Warning Letter** | The regulator has escalated. This needs immediate senior attention. |

You may also see **Response Due** shown as a reminder when the deadline is near.

**Observation statuses**

| Status | What it means in practice |
|---|---|
| **Open** | The observation hasn't been addressed yet. |
| **CAPA Linked** | A corrective action has been raised for it. |
| **Response Drafted** | Its part of the response has been drafted. |
