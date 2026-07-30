# Process — CSV / CSA Validation

> **This chapter is partly grounded, partly thin.** CSV/CSA Validation was **not** part of the review
> the rest of this manual is built on. The **roles** and the **statuses** below come from the app's own
> shared definitions and are reliable; the **step-by-step process and the screens are not confirmed** and
> are marked **[VERIFY: not covered by audit — confirm in live app]**. Treat the flow as a well-informed
> skeleton to finish in the running app.

## 1. What this process achieves

This process validates a computer system, stage by stage. A validation specialist prepares each stage's
documents, submits them for review, and a QA Head approves or rejects the stage; the system is signed
off when its stages are complete. [VERIFY: not covered by audit — confirm the overall shape in the live
app.]

## 2. Who takes part

*(Roles are from the app's shared definitions and are reliable. What each does at each screen is
[VERIFY].)*

| Role | Raise | Fill | Assign | Review | Sign | Close | View only |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **CSV / Validation Lead** | ✓ | ✓ | [VERIFY] | | [VERIFY] | | |
| **QA Head** | ✓ | ✓ | [VERIFY] | ✓ | ✓ [VERIFY] | ✓ [VERIFY] | |
| **QA** | | | | | | | ✓ |
| **Regulatory Affairs** | | | | | | | ✓ |
| **QC Lab Director** | | | | | | | ✓ |
| **IT / CDO** | | | | | | | ✓ |
| **Operations Head** | | | | | | | ✓ |
| **Customer Admin** | | | | | | | ✓ |
| **Viewer** | | | | | | | ✓ |

- **Raise / Fill** — creating a system and preparing its validation stages is for the **CSV/Validation
  Lead and QA Head**. **Review** — approving or rejecting a stage is **QA Head's**. **Sign** — signing
  off is **QA Head's**.
- Whether the sign-off asks for a **password** is **[VERIFY: not covered by audit — confirm in live
  app]**.
- A person can also be given a **stage rework task**, which appears in their **My Work** — see step 4.

## 3. The process, step by step

> The order and the roles are well-informed; the exact fields, buttons, and gates are **[VERIFY: not
> covered by audit]**.

### Step 1 — Prepare a validation stage
- **Who:** CSV/Validation Lead (or QA Head).
- **Opens and clicks:** **CSV/CSA Validation** → the system → the stage → prepares its documents.
- **Fills in:** [VERIFY: not covered by audit.]
- **Signed action?** No.
- **Status after:** the stage is **Draft**.

### Step 2 — Submit the stage for review
- **Who:** CSV/Validation Lead.
- **Gate:** the stage's documents are prepared. [VERIFY exact gate.]
- **Signed action?** No.
- **Status after:** the stage is **In Review**.

### Step 3 — Approve or reject the stage
- **Who:** QA Head.
- **Opens and clicks:** the stage → approves or rejects it.
- **Signed action?** [VERIFY: not covered by audit — confirm whether approval asks for a password.]
- **Status after:** **Approved** or **Rejected**.

### Step 4 — (Where needed) work a stage rework task
- **Who:** the person a rework task is assigned to.
- **What happens:** a stage rework task appears in that person's **My Work**; they work it and submit it
  back, and a reviewer who is **not** the assignee reviews it. This much is confirmed.
- **[VERIFY: not covered by audit — confirm who assigns the task and the exact steps.]**

### Step 5 — Sign off the system
- **Who:** QA Head.
- **Gate:** the system's stages are complete. [VERIFY exact gate.]
- **Signed action?** [VERIFY: not covered by audit — confirm whether sign-off asks for a password.]

## 4. The independence rules

- **A stage rework task cannot be reviewed by the person it was assigned to** — a different colleague
  must review it. This one rule is confirmed.
- [VERIFY: not covered by audit — confirm any other separate-person rules, for example whether the
  person who prepared a stage may also approve it.]

## 5. Signing & closing

Signing off a validation stage or system appears to be a QA Head action. **Whether it is a
password-signed action is [VERIFY: not covered by audit — confirm in live app.]**

## 6. Where it can stall

| What the user sees | Why | What to do |
|---|---|---|
| **A stage won't submit** | Its documents may not be prepared. | [VERIFY the exact requirement]; complete the stage's documents. |
| **I can't approve a stage** | Approving is QA Head's. | Ask your QA Head. |
| **A rework task is waiting on me** | You've been assigned stage rework. | Open it in **My Work** and submit it back. |
| **Anything else** | [VERIFY: not covered by audit.] | Confirm the real blockers in the live app. |

## 7. Statuses

*(These stage statuses come from the app's shared definitions and are reliable.)*

| Status | What it means in practice |
|---|---|
| **Not Started** | The stage hasn't begun. |
| **Draft** | The specialist is preparing the stage's documents. |
| **In Review** | Submitted to QA Head to approve or reject. |
| **Approved** | QA Head approved it; the stage is complete. |
| **Rejected** | QA Head rejected it; rework is needed. |
| **Skipped** | Not applicable for this system. |
