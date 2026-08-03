# Process — Managing People & Access

This chapter is for administrators. It explains the ten roles, how you set someone up, what each role
is allowed to do, and which parts of the app each role can reach. It's the reference for "who is
allowed to do what, and why can't they."

---

## 1. The ten roles, in one line each

| Role | What kind of work they may do |
|---|---|
| **Platform Admin** | Manages the platform and customer accounts from a separate area. **Never creates, changes, or signs quality work.** |
| **Customer Admin** | Administers your organisation — people, sites, and settings. **Can view quality records but cannot create, change, or sign them.** (May raise and manage risks and management reviews in Governance.) |
| **QA Head** | The quality authority. Raises, assigns, reviews, closes, and signs quality work, and sees every record for the site. |
| **QA** | Hands-on quality. Raises findings and deviations, and carries out tasks assigned to them. Does not approve or sign. |
| **CSV / Validation Lead** | A validation specialist. Raises findings and deviations, does assigned tasks, and can add documents to the library. |
| **Regulatory Affairs** | Owns regulator-facing work. Raises findings and deviations, and can sign inspection responses. |
| **QC Lab Director** | A quality-control-lab specialist. Raises findings and deviations, and does assigned tasks. |
| **IT / CDO** | An IT-and-data specialist. Raises findings and deviations, and does assigned tasks. |
| **Operations Head** | An operations specialist. Raises findings and deviations, and does assigned tasks. |
| **Viewer** | Read-only everywhere. Can look, but not create, change, or sign anything. |

---

## 2. What access differs by role

Four plain rules run through everything:

- **Who can create quality records** — the working roles (QA, CSV/Validation Lead, Regulatory Affairs,
  QC Lab Director, IT/CDO, Operations Head) and QA Head. They raise findings and deviations.
- **Who can only view quality records** — **Customer Admin views quality work but cannot author it**:
  they can read a deviation, a finding, or a corrective action, but cannot raise, change, or sign one.
  Viewer is read-only too.
- **Who can sign** — only people who have been given **signing authority** (see section 5), and only
  QA Head and Regulatory Affairs sign the quality actions that need a signature. **Platform Admin never
  signs quality work.**
- **Who administers the organisation** — Customer Admin (people, sites, settings). Platform Admin runs
  the platform itself, in a separate area.

---

## 3. Adding a person

Only a Customer Admin does this.

1. Open **Settings** and go to **People**.
2. Select **Add**.
3. Fill in the person's **name**, **email**, **username**, **role**, and a starting **password**. All
   are required.
4. Confirm.

**Adding a person does not ask you for your own password** — it isn't a legally signed action.

**What the role decides.** The role you choose is what decides everything that person can do: which
parts of the app they see, whether they can create quality records or only view them, and whether they
can be given signing authority. You can only grant the roles you're allowed to grant — a Customer Admin
cannot create another administrator or a platform-level account.

**Assigning a site.** Most roles work at a single site and must be given one — without a site, a
site-bound person cannot sign in. A few roles see every site by design and don't need one assigned:
QA Head and Customer Admin (and Platform Admin, who sits outside sites). [VERIFY] the exact place you
set a person's site on your screen.

**What changes for that person, straight away:**

- They can sign in with the details you set.
- Their menu and what they can do follow their role.
- They see the records for their site — or, if they're QA Head or Customer Admin, every record for the
  site.

---

## 4. Changing a person later

- **Turn an account off or on.** Open the person in **People** and select **Deactivate** or
  **Activate**. A deactivated person cannot sign in until reactivated. You cannot change your own
  account this way.
- **Edit a person's details or role.** Open them and change what's needed. Editing does not ask for
  your password.

---

## 5. Signing authority, and the actions that ask for a password

**Signing authority** is a separate switch from a person's role. Some quality actions are *legally
signed* — signing one records that a named person, at that moment, took that decision, and it asks the
signer to enter their password. A person can only perform those actions if an administrator has given
them signing authority.

Two administrator actions are themselves legally signed, so **they ask you (the admin) for your own
password:**

- **Removing a person.** Open the person in **People**, select **Delete**, and enter your **password**
  to confirm. Where you can, switch the account off instead of removing it, so their history stays
  clear.
- **Changing who can sign.** Turn a person's **signing authority** on or off, and enter your
  **password** to confirm. You cannot change your own signing authority.

**Adding a person does not ask for a password.** Editing a person, or turning an account off and on,
does not either. Only removing a person and changing signing authority do.

**If your password is wrong**, the change does not go through, and the attempt is recorded. Enter the
correct password and try again.

---

## 6. Who can reach which part of the app

This is the see-it / don't-see-it map. "Sees it" means the item is in that role's menu; it doesn't
always mean they can change what's inside (that's sections 2 and 5).

| Part of the app | Who sees it |
|---|---|
| **Dashboard** | Everyone except Platform Admin. |
| **Gap Assessment** | Working roles and QA Head act; Customer Admin and Viewer can view. |
| **Deviation Management** | Everyone except Platform Admin. |
| **CAPA Tracker** | **Only QA Head and Customer Admin.** Everyone else reaches their corrective-action work through **My Work**. |
| **My Work** | Everyone except Platform Admin. |
| **Inspections & Regulatory** | Working roles and QA Head; Customer Admin and Viewer can view. |
| **Evidence & Documents** | Most roles. |
| **Training & Awareness** | Everyone except Platform Admin. |
| **Governance & KPIs** | **Only QA Head and Customer Admin.** |
| **Audit Trail** | **Only QA Head and Customer Admin.** |
| **Settings** | Customer Admin makes changes; anyone else who reaches it sees it read-only. |
| **Support** | Everyone. |

**Within a screen, most people see only their own records** — the ones they raised or were assigned.
**QA Head and Customer Admin see every record for the site.** **My Work only ever shows work assigned
to the person looking at it.**

---

## 7. Where access questions usually come from

| What the person says | Why, and what to do |
|---|---|
| "I can't find a whole part of the menu." | Some parts are limited by role — CAPA, Governance, and the Audit Trail are for QA Head and Customer Admin; Settings is for Customer Admin. Check their role. |
| "I can see records but can't change them." | They may be a Customer Admin or Viewer, who view quality work but don't author it. Or the record isn't theirs. |
| "A new person can't sign in." | Check their account is active, they have a site (if their role needs one), and their details are right. |
| "Someone can't sign a closure." | They need signing authority. An administrator grants it — and that grant is itself a signed action. |
| "I can't create an administrator." | A Customer Admin can grant only certain roles. Higher-level accounts are set up outside this screen. |
