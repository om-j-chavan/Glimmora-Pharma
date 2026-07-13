# BUG-002 — CAPA closure does not propagate to linked FDA 483 observation

**Severity:** Medium
**Status:** Open
**Filed:** 2026-05-03
**Source:** Surfaced during the USER_GUIDE.md verification pass —
see [USER_GUIDE_CONFIRMATIONS.md](../USER_GUIDE_CONFIRMATIONS.md)
item 8.

## One-line summary

When a CAPA raised from an FDA 483 observation is signed and
closed, the linked Finding (Gap Assessment) auto-closes — but
the linked FDA 483 observation does not. The observation
remains "Open" against a "Closed" CAPA. Audit-trail asymmetry.

## Reproduction steps

1. Sign in as `qa@pharmaglimmora.com` / `Demo@123`.
2. Open **FDA 483 & Regulatory Events** from the sidebar.
3. Open or create a 483 event with at least one observation.
4. From an observation, click **Raise CAPA**. A linked CAPA is
   created (`FDA483Observation.capaId` is set on the observation).
5. Open the CAPA in **CAPA Tracker**. Add an RCA, submit for
   QA review.
6. As QA Head, **Sign & Close** the CAPA.
7. The CAPA status flips to **Closed**.
8. **Open the FDA 483 event again** and check the observation —
   its status is still whatever it was before (typically `Open`
   or `RCA In Progress`). Closure did not propagate.

Verified against current `dev-evidence-feature` HEAD (commit `40f5b76`).

## Root cause

[src/actions/capas.ts:342-347](../../src/actions/capas.ts#L342-L347) — `signAndCloseCAPA` closes the
linked Finding:
```
if (capa.findingId) {
  await prisma.finding.update({
    where: { id: capa.findingId, tenantId: session.user.tenantId },
    data: { status: "Closed" },
  });
}
```

There is **no equivalent block for FDA 483 observations**.
The CAPA model has no FK to `FDA483Observation` — the relation
runs the other way (`FDA483Observation.capaId` references the
CAPA). `signAndCloseCAPA` does not query in that direction.
A grep confirms there is no `prisma.fda483Observation` mutation
anywhere in `signAndCloseCAPA` or its callers.

The asymmetry is asymmetric awareness: the CAPA "knows" about
its linked Finding (because `findingId` lives on the CAPA row)
but does not "know" about its linked FDA observations (which
hold the link on their side).

## Affected users

Anyone using the FDA 483 module end-to-end. Practical impact:
the FDA 483 event readiness score (which counts closed
observations) remains artificially low after closure work is
actually complete — and an inspector glancing at the
observation list sees an "Open" observation whose CAPA is
already closed and signed off.

## Suggested fix

In `signAndCloseCAPA` ([src/actions/capas.ts:315-370](../../src/actions/capas.ts#L315-L370)), after the
existing CAPA + Finding update, add:

```ts
// Close every FDA 483 observation that linked back to this CAPA.
// The link is held by the observation (capaId), not by the CAPA,
// so we have to query the reverse direction.
await prisma.fDA483Observation.updateMany({
  where: { capaId: id },
  data: { status: "Closed" },
});
```

Add the corresponding audit-log entry (one per observation
closed, or a summary entry mentioning the count). When Phase 0
of CAPA_GAP_REPORT.md adds the immutable Signature record and
wraps closure in a transaction, this propagation should sit
inside the same transaction so it succeeds or rolls back atomically with the CAPA closure.

There is no schema change needed — `FDA483Observation.status`
already exists and accepts `"Closed"`
([prisma/schema.prisma:278](../../prisma/schema.prisma#L278)).

## Workaround until fixed

Documented in [USER_GUIDE.md §4.5](../USER_GUIDE.md) (after the Edit E update on
this branch): after closing a CAPA that came from an FDA 483
observation, go to the FDA 483 events page and close the
observation manually.

## Blocks

Not a Phase 0 (Defensive) blocker — Phase 0 is scoped to
Closed-CAPA immutability and the Part 11 e-signature record.
This bug should land alongside **Phase 1** workflow expansion,
because the cleanest implementation puts the propagation inside
the new Phase-0 transaction wrapper that's being built for
`signAndCloseCAPA` anyway.

## Related

- USER_GUIDE_CONFIRMATIONS.md item 8
- Existing closure path: [src/actions/capas.ts:315-370](../../src/actions/capas.ts#L315-L370)
- Related Phase 0 work: CAPA_GAP_REPORT.md → Phase 0 item 0.2
  (Signature persistence inside a transaction) is the natural
  place to slot the propagation in.
