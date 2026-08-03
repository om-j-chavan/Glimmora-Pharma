# Process — Governance & KPIs

## 1. What this process achieves

This process runs your oversight records: the risk register, the record of management reviews, and the
quality scorecards. You raise and manage risks, turn a risk into real quality work when it needs one,
and minute management meetings. Unlike every other quality area, **Customer Admin may create and change
records here**, because these are oversight records, not quality records.

## 2. Who takes part

| Role | Raise | Fill | Assign | Review | Sign | Close | View only |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **QA Head** | ✓ | ✓ | — | — | — | ✓ | |
| **Customer Admin** | ✓ | ✓ | — | — | — | ✓ | |

- **Raise** — add a risk or minute a meeting. **Fill** — edit a risk or amend a meeting. **Close** —
  archive a risk or meeting. There is **no signed step** here, so the Sign column is not used.
- **Turning a risk into quality work (converting it) is QA Head's alone** — see step 4 and section 4.
- **No other role reaches this screen.** Governance is available only to QA Head and Customer Admin;
  everyone else never sees it, which is why the working roles and Viewer aren't in this table.

## 3. The process, step by step

### Step 1 — Raise a risk
- **Who:** QA Head or Customer Admin.
- **Opens and clicks:** **Governance & KPIs** → **Risk Register** → **Add Risk**.
- **Fills in:** a **title**, a **description**, the **category**, the **severity**, the **likelihood**,
  and the **owner**. All required. A site, target date, and mitigation plan are optional.
- **Gate:** none.
- **Signed action?** No.
- **Status after:** **Open**.

### Step 2 — Edit a risk
- **Who:** QA Head or Customer Admin (as managing roles), or the person who raised or owns the risk.
- **Opens and clicks:** the risk → **Edit** → changes what's needed.
- **Gate:** the risk hasn't been converted (a converted risk is fixed).
- **Signed action?** No.

### Step 3 — Archive a risk
- **Who:** a managing role — QA Head or Customer Admin.
- **Opens and clicks:** the risk → **Archive** → confirms.
- **Gate:** the person who only raised or owns a risk can edit it but **not** archive it.
- **Signed action?** No.
- **Status after:** archived (removed from the active list). [VERIFY] whether the screen confirms this
  clearly — it may not (checklist row 8).

### Step 4 — Turn a risk into quality work
- **Who:** QA Head only.
- **Opens and clicks:** the risk's detail → the **Convert** section → chooses a **gap**, a **deviation**,
  or a **corrective action** → fills in the details and confirms.
- **Gate:** the risk is live (Open or Mitigating), not closed or already converted.
- **Signed action?** No.
- **Status after:** the risk is **Converted** (final); a real quality record is created and linked back,
  and then follows its own process.

### Step 5 — Minute a management review
- **Who:** QA Head or Customer Admin.
- **Opens and clicks:** **Management Reviews** → **Record Decision**.
- **Fills in:** a **topic**, a **meeting date**, the **attendees**, and at least one decision or
  follow-up item. All required.
- **Signed action?** No.

### Step 6 — Amend a meeting or tick off a follow-up item
- **Who:** a managing role, or the person who minuted the meeting.
- **Opens and clicks:** the meeting → **Amend**, or ticks a follow-up item done or open again.
- **Signed action?** No.

### Step 7 — Export the scorecard report
- **Who:** QA Head or Customer Admin.
- **Opens and clicks:** the **KPIs** view → the export option. [VERIFY] the exact report name (checklist).

## 4. The independence rules

- **Only a QA Head can convert a risk into quality work.** A Customer Admin can raise and manage a risk,
  but cannot convert it — because conversion creates a real quality record, which must be authored by a
  quality authority.
- **Archiving is for the managing roles.** The person who only raised or owns a risk can edit it but
  cannot archive it; archiving anyone's risk is a managing-role action.

## 5. Signing & closing

**None.** Governance has **no** legally signed step — nothing here asks for a password. When a risk is
converted, the real quality record it becomes carries its own signing later, in its own process.

## 6. Where it can stall

| What the user sees | Why | What to do |
|---|---|---|
| **I can't find Governance in my menu** | It's available only to QA Head and Customer Admin. | Ask one of them. |
| **"Archive" isn't available on a risk** | Archiving is for the managing roles. | A creator or owner can edit but not archive; ask a managing role. |
| **The Convert options are greyed out** | Only QA Head can convert a risk. | Ask your QA Head. |
| **I can't convert a closed risk** | A closed risk can't be converted. | Reopen it first, then convert. |
| **I can't edit a converted risk** | Once converted it's fixed. | Open the record it became and continue there. |
| **I archived something and nothing seemed to happen** | [VERIFY] archiving may not always confirm (checklist row 8). | Refresh the list to check; if it's still there, try again or ask QA Head. |

## 7. Statuses

**Risk**

| Status | What it means in practice |
|---|---|
| **Open** | Raised and being watched. |
| **Mitigating** | Work is under way to reduce it. |
| **Closed** | No longer needs active management. Can be reopened if it returns. |
| **Converted** | Turned into a gap, deviation, or corrective action. Final — the work now lives in that record. |

**Follow-up item (in a management review)**

| Status | What it means in practice |
|---|---|
| **Open** | Still needs doing. |
| **Done** | Complete. |
