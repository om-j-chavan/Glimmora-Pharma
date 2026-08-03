# Chapter 2 — The Dashboard

## 1. What this is for

The Dashboard is your starting screen and your at-a-glance view of how the site is doing. It shows
headline numbers on readiness, open critical work, and overdue actions, so you can see where attention
is needed without opening every screen. It's a place to look and jump off from — you don't do work
here, you go from here to the work.

## 2. Who uses it

Everyone lands on the Dashboard when they sign in (except the Platform Admin, who works elsewhere). The
headline numbers are the same for everyone — they cover the whole site. What differs is what you see
when you click through into the detail: QA Head and Customer Admin see all the records behind a number,
while other roles see only the records that are theirs (see section 3).

## 3. The screens

The Dashboard is one page with several parts. [VERIFY] the exact tiles, labels, and click targets on
your screen — the names below are descriptive.

**The headline tiles** across the top give you the key numbers, for example:

- **Overall readiness** — how prepared the site is, as a percentage.
- **Critical findings** — how many serious gaps are open.
- **Overdue corrective actions** — how many corrective actions are past their due date.
- **Validation at high risk** — how many systems need validation attention.
- **Training** — how far along training is, as a percentage.

[VERIFY] the exact tile names and how many there are.

> **Important — the numbers are site-wide, but your lists may be shorter.** Every headline number
> counts the whole site. When you click through to see the records behind a number, though, most roles
> see only the records they raised or were assigned — so the list you land on can be shorter than the
> number suggested. That's expected: QA Head and Customer Admin see everything behind a number;
> everyone else sees their own share. [VERIFY] exactly where each tile takes you, and what a non-QA-Head
> user sees when they click a headline tile — some tiles lead toward the scorecards, which only QA Head
> and Customer Admin can open.

**The other panels** on the page typically include:

- A **readiness heatmap** — a grid showing how each area is doing. Selecting a cell takes you to the
  related findings. [VERIFY] the click target.
- A **trend chart** — how findings by severity have moved over time.
- A **90-day plan** — the near-term work that needs attention. The rows here are already limited to
  what you can see, so they match your own lists.
- **Insight** and **risk-signal** panels — short prompts pointing you to where attention is needed,
  each with a link into the relevant screen.
- An **Ask AI** panel — a way to search your records in plain language. It searches only the records
  you're allowed to see.

## 4. How to…

### Read the Dashboard

1. Sign in. You arrive on the Dashboard.
2. Read the headline tiles for the site's overall position.
3. Scan the panels below for where attention is needed.

### Focus the view with filters

1. Use the **time** filter to change the period the Dashboard covers. It starts on a recent window by
   default. [VERIFY] the default period and the choices offered.
2. Use the **severity** filter to focus on more serious items.
3. If your role covers more than one site, use the **site** filter to switch between them. If you work
   at a single site, you won't see this choice.
4. Use **Clear filters** to return to the full view.

### Jump to the work behind a number

1. Select a tile, a heatmap cell, a plan row, or an insight link.
2. The Dashboard takes you to the matching screen. Remember the note in section 3: the number was
   site-wide, but the list you land on shows what you're allowed to see.

## 5. Why can't I…?

| What you see | Why, and what to do |
|---|---|
| **The list I clicked into is shorter than the number on the tile** | The tile counts the whole site; the list shows only the records that are yours. This is normal for most roles. QA Head and Customer Admin see the full list behind a number. |
| **Clicking a headline tile didn't take me where I expected** | Some tiles lead toward the scorecards, which only QA Head and Customer Admin can open. [VERIFY] what a non-oversight role sees when selecting these tiles. |
| **There's no site filter for me** | You're assigned to a single site, so there's nothing to switch between. The site filter only appears for roles that cover more than one site. |
| **The corrective-action numbers look empty for me** | The corrective-action detail is shown in full to QA Head and Customer Admin. Other roles reach their own corrective-action work through **My Work**. [VERIFY] what the tile shows for a non-oversight role. |
| **An insight or link didn't lead anywhere useful** | Insight panels point you toward a screen; if the underlying area isn't one your role opens, the prompt may not apply to you. |

## 6. What happens next

The Dashboard doesn't create work or send alerts — it's a read-only overview. It's a launch point: from
here you move into the screens where the actual work happens. Alerts about work assigned to you appear
on the bell (Chapter 11), not on the Dashboard.

## 7. Statuses

The Dashboard has no statuses of its own. It **summarises** the state of records that live in other
screens — findings, corrective actions, inspections, and validation — using their own statuses. To
understand a status behind a number, see the chapter for that record:

| Behind this number | See |
|---|---|
| Critical findings | Chapter 3 — Gap Assessment |
| Overdue corrective actions | Chapter 5 — CAPAs |
| Readiness / training | Chapter 9 — Training & Awareness |
| Validation at high risk | The validation screen |
