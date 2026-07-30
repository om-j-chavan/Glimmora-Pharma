# Chapter 50 — Worked Examples

This chapter follows five records from start to finish, as stories, so you can see how work moves from
one person to the next. Watch for the **handovers** — the points where the app deliberately requires a
*different* person to take the next step. Those are where most people get confused ("why can't I just
finish it myself?"), and they exist to keep every quality decision independent.

## The cast

Each person's job title decides what they're allowed to do. The stories keep to those limits.

| Name | Role | What that lets them do |
|---|---|---|
| **Tom Alvarez** | Operations Head | Report deviations and findings; do work assigned to them. |
| **Sara Okoro** | QC Lab Director | Raise findings and deviations; do assigned work. |
| **David Chen** | CSV / Validation Lead | Raise findings and deviations; add documents to the library. |
| **Lena Duarte** | Regulatory Affairs | Run inspections and sign their responses. |
| **Ravi Menon** | QA | Carry out tasks assigned to them, from My Work. |
| **Priya Nair** | QA Head | Assign, review, close, and sign; convert risks; raise corrective actions. |
| **Nadia Farouk** | QA Head | The same — a second QA Head, so independent sign-offs are possible. |
| **Marcus Webb** | Customer Admin | Manage people, sites, and the risk register; view quality records. |

> Two QA Heads appear on purpose. Several steps can't be done by the same person who did the step
> before, so a second QA Head is often what lets a record finish.

---

## Story 1 — A deviation, start to finish

*A temperature excursion is spotted on the packing line.*

1. **Tom (Operations Head)** opens **Deviation Management**, selects **Report Deviation**, fills in what
   happened, and confirms.
   - *What had to be done first:* nothing — anyone in a working role can report.
   - *Status after:* **Open**. Tom can see his own deviation; so can the QA Heads. Most other people
     can't see it at all.
2. **Priya (QA Head)** opens the deviation and selects **Start Investigation**.
   - *Status after:* **Under Investigation**.
3. **Priya** records the **root cause** in the Investigation section and saves.
   - *Why Priya and not a line colleague:* only the QA Heads (and the person who reported it) can see
     this deviation, and the reporter isn't allowed to investigate their own. So a QA Head does it.
   - *Status after:* **Pending QA Review**.
4. **⚠ Handover.** Because **Priya recorded the investigation, she can't also decide on a corrective
   action or sign the deviation closed.** A different QA Head takes over. **Nadia (QA Head)** opens the
   deviation and records the **corrective-action decision** (here: not required, with a reason).
   - *What the next person sees:* the deviation doesn't drop into anyone's work list. Nadia finds it by
     opening the deviation list and looking at the ones marked **Pending QA Review**.
   - *Status after:* **Pending QA Review**.
5. **Nadia** selects **Sign & Close**, writes a closing note, and enters her **password** to sign.
   - *Why Nadia and not Priya:* the person who closes can't be the reporter or the investigator. Tom
     reported it; Priya investigated it; Nadia is clear of both.
   - *Status after:* **Closed**.

> If the corrective-action decision had been *required*, Nadia would have raised a corrective action
> instead. The deviation would then wait at **CAPA Pending** until that corrective action was closed,
> and only then be signed closed. And if the deviation had been low priority, a QA Head could instead
> have assigned a **task** to a named person — that task *would* appear in their **My Work**.

**Summary**

| Step | Who | What they do | Status after |
|---|---|---|---|
| 1 | Tom (Operations Head) | Reports the deviation | Open |
| 2 | Priya (QA Head) | Starts the investigation | Under Investigation |
| 3 | Priya (QA Head) | Records the root cause | Pending QA Review |
| 4 | Nadia (QA Head) | Records the corrective-action decision | Pending QA Review |
| 5 | Nadia (QA Head) | Signs and closes (password) | Closed |

---

## Story 2 — A finding, start to finish

*An internal check turns up a gap against a data-integrity requirement.*

1. **Sara (QC Lab Director)** opens **Gap Assessment**, selects **Report Gap**, describes the
   requirement and the gap, sets it to **Low** severity, and confirms.
   - *Status after:* **Open**. Sara owns it.
2. **Sara** records the **Root Cause** in the finding's Root Cause section.
   - *What had to be done first:* nothing — as the person who raised it, Sara may record the root cause,
     but only up until it's assigned to someone.
   - *Status after:* **Open** (now with a root cause recorded).
3. **Priya (QA Head)** opens the finding and **assigns** it to Ravi.
   - *What the next person sees:* the finding appears in **Ravi's My Work**, and Ravi is alerted.
   - *Status after:* **In Progress**.
4. **Ravi (QA)** opens the task in **My Work**, attaches his evidence, adds his notes, and selects
   **Submit to QA**.
   - *What had to be done first:* Priya had to assign it to him — Ravi couldn't have picked it up
     otherwise.
   - *Status after:* **Submitted**.
5. **⚠ Handover.** Ravi can't review or close his own work. **Priya (QA Head)** opens the finding and
   selects **Accept & close**.
   - *Why Priya can close it:* the person who closes must not be the one who recorded the root cause.
     Sara recorded it, and Priya is a different person — so Priya is clear. (If *Priya* had recorded the
     root cause herself, she couldn't close it, and Nadia would have to.)
   - *What the next person sees:* Ravi is told his work was accepted and closed.
   - *Status after:* **Closed**.

> A note on finding QA at step 4→5: submitting doesn't send QA an alert. Priya finds submitted findings
> by opening the register and looking at the ones marked **Submitted**. If she'd sent it back instead,
> it would return to **Ravi's My Work** as **Returned**, with her reason.

**Summary**

| Step | Who | What they do | Status after |
|---|---|---|---|
| 1 | Sara (QC Lab Director) | Raises the finding | Open |
| 2 | Sara (QC Lab Director) | Records the root cause | Open |
| 3 | Priya (QA Head) | Assigns it to Ravi | In Progress |
| 4 | Ravi (QA) | Works it and submits (from My Work) | Submitted |
| 5 | Priya (QA Head) | Accepts and closes | Closed |

---

## Story 3 — An inspection observation, start to finish

*A regulator visits and leaves a written observation.*

1. **Lena (Regulatory Affairs)** opens **Inspections & Regulatory**, selects **Register Event**, enters
   the inspection details, and confirms.
   - *Status after:* inspection **Open**.
2. **Lena** goes to **Observations** and adds the regulator's observation.
   - *Status after:* observation **Open**.
3. **Lena** goes to **Investigation** and records the observation's **root cause**.
   - *Status after:* the observation now carries a root cause. [VERIFY] the exact status label the
     observation shows at this point.
4. **⚠ Handover.** Lena **can't raise the corrective action herself** — that's reserved for a QA Head.
   **Priya (QA Head)** opens the observation and raises a **corrective action** from it.
   - *What the next person sees:* a corrective action is created and then runs like any other (Story 5's
     tail, or Chapter 5); once its pieces are assigned, they appear in the doers' **My Work**.
   - *Status after:* observation **CAPA Linked**.
5. **Lena** goes to **Response** and drafts the response.
   - *What had to be done first:* the response draft stays locked until **every** observation has both a
     root cause **and** a linked corrective action. Priya's step 4 is what unlocked it for Lena.
   - *Status after:* inspection **Response Drafted**.
6. **Lena** works through the readiness steps, selects **Sign & Submit**, confirms the meaning of her
   signature, and enters her **password**.
   - *Why Lena can sign:* signing an inspection response is allowed for Regulatory Affairs as well as
     QA Head. [VERIFY] the on-screen wording, which may mention only QA Head.
   - *Status after:* inspection **Response Submitted**.
7. **Lena** later selects **Record Outcome**, chooses the regulator's result, and enters her
   **password**.
   - *Status after:* the matching outcome — for example **FDA Acknowledged** or **Closed**.

**Summary**

| Step | Who | What they do | Status after |
|---|---|---|---|
| 1 | Lena (Regulatory Affairs) | Registers the inspection | Event: Open |
| 2 | Lena (Regulatory Affairs) | Adds the observation | Observation: Open |
| 3 | Lena (Regulatory Affairs) | Records the observation's root cause | Observation: root cause recorded [VERIFY] |
| 4 | Priya (QA Head) | Raises the corrective action from it | Observation: CAPA Linked |
| 5 | Lena (Regulatory Affairs) | Drafts the response | Event: Response Drafted |
| 6 | Lena (Regulatory Affairs) | Signs and submits (password) | Event: Response Submitted |
| 7 | Lena (Regulatory Affairs) | Records the outcome (password) | Event: FDA Acknowledged / Closed |

---

## Story 4 — A document, start to finish

*A supporting document has to back up a piece of corrective work.*

1. **Ravi (QA)** opens his corrective-action task in **My Work** and uploads the supporting document to
   it.
   - *What had to be done first:* a QA Head had to assign Ravi the task — evidence is attached to the
     task, so the task has to exist first.
   - *Status after:* the document is **attached to the corrective action**. It also shows up in the
     **Evidence library**, but **locked** there — it's managed from the record, not the library.
2. **Ravi** adds his notes and submits the task. The document travels with it.
   - *Status after:* attached, and now awaiting QA review.
3. **⚠ Handover.** The doer uploads evidence; **QA reviews it rather than adding it.** **Priya (QA
   Head)** opens the corrective action, reviews Ravi's work, and opens his document as evidence.
   - *Status after:* the document is part of the record Priya is reviewing.
4. **Priya** accepts the work.
   - *Status after:* the document is **retained as part of the record** for good.

> **The evidence rule is strictest on deviations:** there, only the person who *reported* the deviation
> can attach its supporting documents — QA reviews the evidence and cannot upload it. It keeps the
> evidence coming from the person who saw the problem.
>
> **The library is separate.** David (CSV/Validation Lead) can upload a standalone reference document to
> the **Evidence library**; only he and the oversight roles (QA Head, Customer Admin) see it. But a
> library document can't be tied to a record from the library — you attach record evidence *inside* the
> record, as Ravi did.

**Summary**

| Step | Who | What they do | Status after |
|---|---|---|---|
| 1 | Ravi (QA) | Uploads the document to his task (My Work) | Attached to the corrective action; locked in the library |
| 2 | Ravi (QA) | Submits the task | Attached; awaiting QA review |
| 3 | Priya (QA Head) | Reviews the work and opens the document | Part of the record under review |
| 4 | Priya (QA Head) | Accepts the work | Retained with the closed record |

---

## Story 5 — A governance risk, start to finish

*A recurring supplier problem is logged as a risk before it becomes an incident.*

1. **Marcus (Customer Admin)** opens **Governance & KPIs**, goes to the **Risk Register**, selects
   **Add Risk**, describes it, and confirms.
   - *What had to be done first:* nothing — on the Governance screen, Customer Admin may raise and
     manage risks (this is oversight, not quality-record work).
   - *Status after:* **Open**.
2. **Marcus** records a mitigation plan and moves the risk along.
   - *Status after:* **Mitigating**.
3. **⚠ Handover.** The risk now needs to become real quality work — but **Marcus can't convert it.**
   Turning a risk into a gap, deviation, or corrective action is reserved for a QA Head, because it
   creates a real quality record that must be authored by a quality authority. **Priya (QA Head)** opens
   the risk and **converts** it into a deviation.
   - *What the next person sees:* a new deviation is created and linked back to the risk. It doesn't
     drop into a work list; it's picked up on the deviation screen.
   - *Status after:* risk **Converted** (this is final — the work now lives in the deviation).
4. From here the new deviation follows **Story 1** — reported into being by the conversion, then
   investigated by one QA Head and signed closed by another.

**Summary**

| Step | Who | What they do | Status after |
|---|---|---|---|
| 1 | Marcus (Customer Admin) | Raises the risk | Open |
| 2 | Marcus (Customer Admin) | Records mitigation; moves it along | Mitigating |
| 3 | Priya (QA Head) | Converts it into a deviation | Converted |
| 4 | — | The new deviation follows Story 1 | Deviation: Open |

---

## The handovers, in one place

If you remember nothing else, remember these — they're the moments the app makes someone else finish
what you started:

- **A deviation:** the reporter can't investigate it; whoever investigates it can't decide the
  corrective action or sign it closed; the person who closes it can't be the reporter, the
  investigator, or the assignee.
- **A finding:** whoever the work is assigned to can't review or close their own work; the person who
  closes it can't be the person who recorded its root cause.
- **An inspection observation:** only a QA Head can raise the corrective action, and the response can't
  be drafted until every observation has both a root cause and a linked corrective action.
- **A document:** the doer uploads the evidence; QA reviews it. On a deviation, only the reporter
  attaches evidence.
- **A risk:** a Customer Admin can raise and manage it, but only a QA Head can convert it into real
  quality work.
