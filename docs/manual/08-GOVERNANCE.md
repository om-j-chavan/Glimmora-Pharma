# Chapter 8 — Governance & KPIs

## 1. What this is for

This screen holds your organisation's oversight records: the risk register, the record of management
reviews, and the quality scorecards. You raise and track risks, turn a risk into real quality work
when it needs one, minute management meetings, and see how the site is performing at a glance. It's the
view that ties day-to-day quality work to management oversight.

## 2. Who uses it

Governance is available to **QA Head and Customer Admin** only. Both can raise, edit, and archive risks
and minute management reviews. Turning a risk into a gap, deviation, or corrective action is reserved
for QA Head. (This is one screen where Customer Admin can create and change records, because these are
oversight records rather than quality records.)

## 3. The screens

Governance has three views you switch between at the top.

**Risk Register** — the working list of risks.

- **Columns** include the risk's title, its **category**, its **severity** and **likelihood** (how bad
  it would be and how likely it is), its owner, and its **status** (see section 7). [VERIFY] the exact
  columns and filters.
- Selecting a risk opens its detail, where you edit it, attach documents, convert it, and see its
  history.

**Management Reviews** — the record of management meetings.

- Each entry is a meeting, with its topic, date, attendees, and a list of decisions and follow-up
  items.
- Selecting a meeting opens its detail, where you amend it and tick its follow-up items done.

**KPIs** — the quality scorecards for the site, and a report you can export.

## 4. How to…

### Raise a risk

1. In **Risk Register**, select **Add Risk**.
2. Fill in the form: a **title**, a **description**, the **category**, the **severity**, the
   **likelihood**, and the **owner**. These are required. A site, target date, and mitigation plan are
   optional.
3. Confirm. The risk appears as **Open**.

### Edit a risk

1. Open the risk and select **Edit**.
2. Change what you need and save.

You can edit a risk if you're a managing role, or if you raised it or own it.

### Archive a risk

1. Open the risk (or use its menu in the list) and select **Archive**, then confirm.

Archiving is for the managing roles. If you only raised or own a risk, you can edit it but not archive
it.

### Turn a risk into quality work (QA Head)

1. Open the risk's detail.
2. In the **Convert** section, choose whether to raise a **gap**, a **deviation**, or a **corrective
   action** from it.
3. Fill in the details for the new record and confirm. A real record is created and linked back to the
   risk, and the risk is marked **Converted**.

### Minute a management review

1. In **Management Reviews**, select **Record Decision**.
2. Fill in the **topic**, the **meeting date**, the **attendees**, and at least one decision or
   follow-up item. These are required.
3. Confirm. The meeting is recorded.

### Amend a meeting or tick off a follow-up item

1. Open the meeting.
2. Select **Amend** to change its details, or use the tick against a follow-up item to mark it done or
   open again.

Amending is for the managing roles, or the person who minuted the meeting.

### Export the scorecard report

In **KPIs**, use the export option to produce the quality report. [VERIFY] the exact report name on
your screen.

## 5. Why can't I…?

| What you see | Why, and what to do |
|---|---|
| **I can't find Governance in my menu** | Governance is available only to QA Head and Customer Admin. |
| **"Archive" isn't available on a risk** | Archiving is for the managing roles. If you raised or own the risk you can edit it, but only a managing role can archive it. |
| **The Convert options are greyed out** | Only QA Head can turn a risk into a gap, deviation, or corrective action. |
| **I can't convert a closed risk** | Reopen the risk first, then convert it. |
| **I can't edit a converted risk** | Once a risk is converted it's fixed — the work continues in the record it became. Open that record from the link on the risk. |
| **I archived something and nothing seemed to happen** | [VERIFY] archiving may not always show a confirmation. Refresh the list to check whether it archived; if it's still there, try again or ask your QA Head. |

## 6. What happens next

- **When you convert a risk**, the new gap, deviation, or corrective action is created and linked back
  to the risk; from there it follows its own chapter, and its owner is alerted.
- Other governance changes — raising, editing, or archiving a risk, minuting or amending a meeting —
  don't send alerts. Each change is recorded in the history, which QA Head and Customer Admin can read.

## 7. Statuses

**Risk statuses**

| Status | What it means in practice |
|---|---|
| **Open** | The risk has been raised and is being watched. |
| **Mitigating** | Work is under way to reduce it. |
| **Closed** | The risk no longer needs active management. It can be reopened if it returns. |
| **Converted** | The risk has been turned into a gap, deviation, or corrective action. This is final — the work now lives in that record. |

**Follow-up item statuses (in a management review)**

| Status | What it means in practice |
|---|---|
| **Open** | The follow-up item still needs doing. |
| **Done** | The follow-up item is complete. |
