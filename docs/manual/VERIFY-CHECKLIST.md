# User & Process Manual — Live-App Verification Checklist

One punch-list for **both** manuals — the user manual (`docs/manual/`) and the process manual
(`docs/process/`). Each row is one `[VERIFY]` tag. Carry this through the running app before either
manual is called final.

Sorted **hardest-consequence first** — the top rows can mislead a user or leave a record stuck if the
manual is wrong; the lower rows are label and column confirmations that only affect polish. Tick
**Done** once you've confirmed the screen matches (or logged a correction). The **Source** column shows
which file(s) depend on the answer — some rows fix two or three documents at once.

**Total open: 38** (behaviour & access: 15 · labels & tiles: 23).

## Behaviour & access — check these first (a wrong answer misleads the user)

| # | Source | What the manuals claim | What to check on screen | Done |
|---|---|---|---|:--:|
| 1 | user `04-DEVIATIONS.md` §7 **and** process `02-DEVIATION.md` Step 8 + §7 | A **Rejected** deviation does **not** move on; both manuals warn the on-screen wording ("returned to investigation") disagrees with the actual, terminal outcome. | Reject a deviation in a test record. Where does it go — truly back to investigation, or a dead stop? **Two documents get corrected at once.** Fix both manuals and flag the mismatch to the build team. | [ ] |
| 2 | user `02-DASHBOARD.md` | Clicking a **headline tile** may lead toward the scorecards, which only QA Head and Customer Admin can open. | Sign in as a non-oversight role (e.g. QC Lab Director). Click each headline tile. Does it open something useful, get refused, or bounce back? Record what happens per tile. | [ ] |
| 3 | user `02-DASHBOARD.md` | Headline numbers are site-wide, but clicking through shows most roles only **their own** records, so the list can be shorter than the number. | As a non-oversight role, click a tile / heatmap cell / plan row and compare the count with the list you land on. Confirm the "shorter list is normal" explanation holds. | [ ] |
| 4 | user `09-TRAINING.md` **and** process `07-READINESS.md` | Completing a readiness task is **final — there's no undo**. | Mark a readiness task complete in a test inspection. Is there any way to reopen it? If yes, both manuals must change. | [ ] |
| 5 | user `06-INSPECTIONS.md`, user `50-WALKTHROUGHS.md` (Story 3) **and** process `04-FDA483.md` | Signing/submitting the response is for **QA Head and Regulatory Affairs**; the on-screen note may say only QA Head. | Sign in as Regulatory Affairs. Can you actually sign and submit a response? Read the on-screen wording and confirm it isn't wrongly limiting it to QA Head. **Fixes three documents.** | [ ] |
| 6 | process `03-CAPA.md` §4 + §5 | On **older** corrective actions, the app decides "who raised it" by matching **names**, which weakens the "must be a different person" check for the root-cause review, the close, and the effectiveness check. | On an older corrective action, confirm the original author is firmly identified, not just name-matched. Where it's name-matched, treat the independence check as unreliable. **Fix-the-app item for old records.** | [ ] |
| 7 | user `02-DASHBOARD.md` | The **overdue corrective-action** tile shows in full to QA Head/Customer Admin; other roles reach that work via My Work. | As a non-oversight role, look at the corrective-action tile. Is it empty, a number, or hidden? Record what that role sees. | [ ] |
| 8 | user `08-GOVERNANCE.md` **and** process `06-GOVERNANCE.md` §3 | Archiving a risk/meeting **may not show a confirmation**; the manuals tell users to refresh and check. | Archive a risk as Customer Admin. Is there a success (or failure) message? If it can fail silently, keep the caution; if it confirms clearly, soften it. | [ ] |
| 9 | user `06-INSPECTIONS.md` **and** process `04-FDA483.md` | The screen **may offer importing observations** from an inspection document. | Open an inspection's Observations. Is there an import-from-document option? If yes, it deserves a walkthrough; if no, remove the tag. | [ ] |
| 10 | user `12-SETTINGS.md` | Adding a person or site **may hit a plan limit**; the manual points the user to their account contact. | Confirm the exact wording shown when a limit is reached, and that the manual's plain-language version matches. | [ ] |
| 11 | user `10-MY-WORK.md` | For a **deviation task**, notes are added **at submit**, not saved separately (unlike gaps and corrective actions). | Open a deviation task in My Work. Is there a separate "Save notes", or only notes-at-submit? Correct the manual to match. | [ ] |
| 12 | process `01-GAP.md` §2 | The person who **raised** a finding can correct its details including the **area** — the audit is unsure the screen actually allows editing "area". | As the raiser of a finding, try to change its **area**. Does the screen allow it? Confirm whether "area" belongs in the raiser's limited-edit set. | [ ] |
| 13 | user `09-TRAINING.md` **and** process `07-READINESS.md` §7 | Readiness tasks **may carry due dates**, which is when **Overdue** would appear. | Check whether the standard readiness tasks have due dates. If none do, note that "Overdue" won't normally appear. | [ ] |
| 14 | **process `08-SUPPORT.md` (whole chapter) — NEW** | Support was **not covered by the audit**. Only "anyone can raise a request" and the alert points (a reply notifies the other side; escalation notifies the platform admins; raising sends no alert) are confirmed; everything else is a skeleton. | Walk Support end to end in the live app: who can reply, escalate, resolve, close, reopen, cancel; the fields; the statuses; whether anything is password-signed. Fill the chapter from what you find. | [ ] |
| 15 | **process `09-CSV.md` (process & sign-off) — NEW** | For CSV/CSA, the **roles and stage statuses are reliable** (from the app's shared definitions), but the **step-by-step flow and screens are not confirmed**, and it's unknown whether stage approval / sign-off is **password-signed**. | Walk a validation stage: prepare → submit → approve/reject → sign-off. Confirm the exact steps and gates, who assigns a rework task, whether the person who prepared a stage may approve it, and whether sign-off asks for a password. | [ ] |

## Labels, columns & tiles — confirm the words match (polish)

| # | Source | What the manuals claim | What to check on screen | Done |
|---|---|---|---|:--:|
| 16 | user `02-DASHBOARD.md` | Five headline tiles named readiness / critical findings / overdue corrective actions / validation at high risk / training. | Confirm the exact tile names and how many tiles there are. | [ ] |
| 17 | user `02-DASHBOARD.md` | The time filter starts on a recent window by default. | Confirm the default period and the list of period choices. | [ ] |
| 18 | user `02-DASHBOARD.md` | A heatmap cell selects through to related findings. | Confirm the click target of a heatmap cell. | [ ] |
| 19 | user `03-GAP-ASSESSMENT.md` | The **Summary** view shows counts/charts of your findings. | Confirm what the Summary view actually shows. | [ ] |
| 20 | user `03-GAP-ASSESSMENT.md` | The **Register** shows reference, title, severity, status, owner, target date. | Confirm the exact columns. | [ ] |
| 21 | user `03-GAP-ASSESSMENT.md` | The Register offers filters (e.g. by status, severity). | Confirm the exact filters available. | [ ] |
| 22 | user `04-DEVIATIONS.md` | The deviation list shows reference, title, severity, priority, status, reporter. | Confirm the exact columns and any filters. | [ ] |
| 23 | user `05-CAPA.md` | The CAPA list shows reference, title, status, owner. | Confirm the exact columns and filters. | [ ] |
| 24 | user `05-CAPA.md` | The CAPA detail groups plan/root cause, people & their work, review, evidence, discussion. | Confirm the section names and arrangement on the detail page. | [ ] |
| 25 | user `06-INSPECTIONS.md` | Detail tabs are Overview / Observations / Investigation / Response / History. | Confirm the exact tab names (including the history tab). | [ ] |
| 26 | user `06-INSPECTIONS.md` **and** process `04-FDA483.md` | The readiness step refers to **commitments** being complete or withdrawn. | Confirm the word "commitments" appears on screen. | [ ] |
| 27 | user `06-INSPECTIONS.md`, user `50-WALKTHROUGHS.md` **and** process `04-FDA483.md` — NEW | An observation shows a particular status **after its root cause is recorded** (before a corrective action is linked). | Record a root cause on an observation and read the status label it shows at that point. Confirm the manuals' wording. | [ ] |
| 28 | user `07-EVIDENCE.md` | The library offers filters (e.g. by where a document came from). | Confirm the exact filters. | [ ] |
| 29 | user `07-EVIDENCE.md` | Tiles show total / editable / locked / recent counts. | Confirm the exact tiles. | [ ] |
| 30 | user `07-EVIDENCE.md` **and** process `05-EVIDENCE.md` §7 | Documents are shown as "yours to manage" vs "Locked". | Confirm the exact status labels shown. | [ ] |
| 31 | user `08-GOVERNANCE.md` | The Risk Register shows title, category, severity, likelihood, owner, status. | Confirm the exact columns and filters. | [ ] |
| 32 | user `08-GOVERNANCE.md` **and** process `06-GOVERNANCE.md` §3 | The KPIs view exports a quality report. | Confirm the exact report name. | [ ] |
| 33 | user `09-TRAINING.md` | Views are Overview / Tasks / Training / Activity. | Confirm the exact tab names. | [ ] |
| 34 | user `09-TRAINING.md` **and** process `07-READINESS.md` | An inspection has labels while being prepared and once closed out. | Confirm the labels shown for an inspection in preparation vs closed out. | [ ] |
| 35 | user `10-MY-WORK.md` | Summary tiles show total / overdue / due this week / waiting on you. | Confirm the exact tiles. | [ ] |
| 36 | user `10-MY-WORK.md` | Task labels are Not Started / In Progress / Returned / Submitted / Done / Closed. | Confirm the exact status wording. | [ ] |
| 37 | user `12-SETTINGS.md` | Editable tabs are People / Sites / Standards; view-only are Subscription / Organisation details. | Confirm the exact tab names. | [ ] |
| 38 | process `00-ACCESS.md` §3 — NEW | An admin sets a person's **site(s)** when adding them; the exact place on the People screen isn't pinned down. | Open **Settings → People → Add** (and a person's edit). Confirm where the site is set, and that site-less roles (QA Head, Customer Admin) don't require one. | [ ] |

---

**When every row is ticked** (or its correction applied), both manuals are safe to call final. Rows 1–6
are the ones that would most embarrass us with a real user — do those before anything else. Rows **1 and
6** are also **fix-the-app** items, not just wording. Rows **14 and 15** are whole-chapter unknowns
(Support and CSV/CSA were never audited) — those two chapters can't be called final until someone walks
them in the live app.
