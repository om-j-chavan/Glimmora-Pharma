/**
 * Inspection Readiness / Training & Awareness demo data.
 *
 * `prisma/seed.ts` never creates an `Inspection`, so /readiness has nothing to
 * select and every tab reads empty. This script fills that gap: three
 * inspections (one rich + upcoming, one early-stage, one closed) with their
 * actions, simulations and training records.
 *
 * Re-runnable: the wipe matches its own three inspections by exact title, so an
 * inspection you created through the UI is never touched. No other module's
 * data is read or written.
 * Requires `npm run db:seed` to have run first (needs the tenant + users).
 *
 *   npx tsx prisma/seed-readiness.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * The three inspections this script owns. The wipe matches on these exact
 * titles, so they are the ONLY rows a re-run may delete — edit a title here and
 * the old row becomes someone else's data and is left alone.
 */
const TITLE = {
  fdaChennai: "FDA Pre-Approval Inspection — Chennai QC Laboratory",
  euMumbai: "EU GMP Re-inspection — Mumbai API Plant",
  whoBangalore: "WHO Prequalification Audit — Bangalore R&D Centre",
} as const;
const DEMO_TITLES = Object.values(TITLE);

/** Day offsets from now — the UI's countdown/overdue logic reads real time. */
const DAY = 86_400_000;
const now = Date.now();
const dPast = (n: number) => new Date(now - n * DAY);
const dFut = (n: number) => new Date(now + n * DAY);

async function main() {
  console.log("Seeding Inspection Readiness / Training & Awareness...\n");

  const demo = await prisma.tenant.findUnique({
    where: { email: "admin@pharmaglimmora.com" },
    select: { id: true, name: true },
  });
  if (!demo) throw new Error("Demo tenant not found — run `npm run db:seed` first.");
  console.log("  Tenant:", demo.name);

  const allUsers = await prisma.user.findMany({ where: { tenantId: demo.id } });
  const byUser = (username: string) => {
    const found = allUsers.find((u) => u.username === username);
    if (!found) throw new Error(`Expected user ${username} not found — run \`npm run db:seed\` first.`);
    return found;
  };
  const priya = byUser("priya.sharma"); // qa_head — inspection lead
  const rahul = byUser("rahul.mehta"); // regulatory_affairs
  const anita = byUser("anita.patel"); // csv_val_lead
  const nisha = byUser("nisha.rao"); // qc_lab_director
  const vikram = byUser("vikram.singh"); // it_cdo
  const sureshKumar = byUser("suresh.kumar"); // operations_head

  // `TrainingRecord.userRole` renders raw in the UI, and the simulation
  // participant picker passes `roleLabel(u.role)` — so store display labels
  // here to match what a "Log training record" modal would send.
  const ROLE = {
    qaHead: "QA Head",
    ra: "Regulatory Affairs",
    csv: "CSV / Val Lead",
    qc: "QC / Lab Director",
    it: "IT / CDO",
    ops: "Operations Head",
  } as const;

  // ── Wipe — ONLY this script's own three demo inspections ──
  // Scoped by exact title, never "everything for the tenant": an inspection you
  // created through the UI must survive a re-run of this script.
  // TrainingRecord.inspection has no onDelete: Cascade (optional relation →
  // SetNull), so its rows MUST go before Inspection or they survive as orphans
  // with a null inspectionId. Simulation/ReadinessAction do cascade.
  const stale = await prisma.inspection.findMany({
    where: { tenantId: demo.id, title: { in: DEMO_TITLES } },
    select: { id: true },
  });
  const staleIds = stale.map((i) => i.id);
  const wipe = await prisma.$transaction([
    prisma.trainingRecord.deleteMany({ where: { tenantId: demo.id, inspectionId: { in: staleIds } } }),
    prisma.inspection.deleteMany({ where: { id: { in: staleIds } } }),
  ]);
  console.log("  Wiped (own demo rows only):", { training: wipe[0].count, inspections: wipe[1].count });

  const kept = await prisma.inspection.count({
    where: { tenantId: demo.id, title: { notIn: DEMO_TITLES } },
  });
  if (kept > 0) console.log(`  Left untouched: ${kept} other inspection(s) in this tenant`);

  /* ═══ 1. FDA PAI — Chennai. Upcoming in 18 days. The rich one. ═══ */

  const i1 = await prisma.inspection.create({
    data: {
      tenantId: demo.id,
      title: TITLE.fdaChennai,
      siteName: "Chennai QC Laboratory",
      agency: "FDA",
      type: "Pre-Approval Inspection",
      status: "planning",
      expectedDate: dFut(18),
      inspectionLead: priya.name,
      notes: "PAI triggered by the ANDA filing for the sterile injectable line. Front room in Conference Room A, back room in QA Annexe.",
      createdBy: priya.name,
      createdById: priya.id,
      createdAt: dPast(45),
    },
  });

  // 10 actions, 5 Complete → ~50% readiness. Two are overdue (one Critical),
  // which fires the Overview "critical actions overdue" danger insight.
  await prisma.readinessAction.createMany({
    data: [
      { inspectionId: i1.id, title: "Confirm front-room / back-room team rosters", lane: "People", bucket: "Immediate", priority: "Critical", status: "Not Started", owner: priya.id, dueDate: dPast(3) },
      { inspectionId: i1.id, title: "Brief all department heads on inspection scope", lane: "People", bucket: "Immediate", priority: "High", status: "Complete", owner: priya.id, dueDate: dPast(10), completedBy: priya.name, completedAt: dPast(11) },
      { inspectionId: i1.id, title: "Rehearse the opening-meeting site presentation", lane: "Process", bucket: "Immediate", priority: "Critical", status: "In Progress", owner: rahul.id, dueDate: dFut(2) },
      { inspectionId: i1.id, title: "Confirm the 20-minute document-retrieval SLA", lane: "Process", bucket: "31-60 days", priority: "Medium", status: "Complete", owner: anita.id, dueDate: dPast(8), completedBy: anita.name, completedAt: dPast(9) },
      { inspectionId: i1.id, title: "Verify ALCOA+ compliance on the last 6 months of QC data", lane: "Data", bucket: "Immediate", priority: "High", status: "Complete", owner: nisha.id, dueDate: dPast(5), completedBy: nisha.name, completedAt: dPast(6) },
      { inspectionId: i1.id, title: "Reconcile audit-trail review logs for LIMS", lane: "Data", bucket: "Immediate", priority: "High", status: "Not Started", owner: nisha.id, dueDate: dPast(1) },
      { inspectionId: i1.id, title: "Close the open LIMS validation gap (CSV-2026-014)", lane: "Systems", bucket: "Immediate", priority: "High", status: "In Progress", owner: anita.id, dueDate: dFut(5) },
      { inspectionId: i1.id, title: "Confirm Part 11 e-signature config on all GxP systems", lane: "Systems", bucket: "61-90 days", priority: "Low", status: "Complete", owner: vikram.id, dueDate: dPast(20), completedBy: vikram.name, completedAt: dPast(22) },
      { inspectionId: i1.id, title: "Index SOP master list + revision history for retrieval", lane: "Documentation", bucket: "Immediate", priority: "Critical", status: "In Progress", owner: anita.id, dueDate: dFut(6) },
      { inspectionId: i1.id, title: "Prepare the site master file summary pack", lane: "Documentation", bucket: "31-60 days", priority: "Medium", status: "Complete", owner: rahul.id, dueDate: dPast(15), completedBy: rahul.name, completedAt: dPast(16) },
    ],
  });

  // 2 Completed (scored) + 2 Scheduled — the Scheduled ones are what you click
  // "Score & complete" on to exercise the write path.
  await prisma.simulation.createMany({
    data: [
      { inspectionId: i1.id, title: "Mock FDA Inspection — Front Room", type: "Mock Inspection", duration: 120, scheduledAt: dPast(12), participants: "Dr. Priya Sharma, Rahul Mehta, Anita Patel", status: "Completed", score: 72, notes: "Opening meeting was strong. Weak point: two document requests exceeded the 20-minute SLA, and answers drifted beyond the question asked. Re-run after the retrieval drill.", createdBy: priya.name, createdAt: dPast(20) },
      { inspectionId: i1.id, title: "Document Retrieval Drill — 20-minute SLA", type: "Document Drill", duration: 45, scheduledAt: dPast(5), participants: "Anita Patel, Dr. Nisha Rao", status: "Completed", score: 88, notes: "9 of 10 requests retrieved inside SLA. The miss was an archived 2024 batch record — off-site retrieval path needs documenting.", createdBy: priya.name, createdAt: dPast(14) },
      { inspectionId: i1.id, title: "Back Room Coordination Dry-Run", type: "Back Room Practice", duration: 90, scheduledAt: dFut(4), participants: "Dr. Priya Sharma, Suresh Kumar, Vikram Singh", status: "Scheduled", createdBy: priya.name, createdAt: dPast(6) },
      { inspectionId: i1.id, title: "Table-Top: Data Integrity Questioning", type: "Table-Top Exercise", duration: 60, scheduledAt: dFut(9), participants: "Dr. Nisha Rao, Vikram Singh", status: "Scheduled", createdBy: priya.name, createdAt: dPast(2) },
    ],
  });

  // 7 records, 4 completed → Overview shows "Team training 57% complete (4/7)".
  await prisma.trainingRecord.createMany({
    data: [
      { tenantId: demo.id, inspectionId: i1.id, userId: priya.id, userName: priya.name, userRole: ROLE.qaHead, module: "Inspection Behaviour & Conduct", status: "completed", score: 95, completedAt: dPast(14), createdAt: dPast(30) },
      { tenantId: demo.id, inspectionId: i1.id, userId: rahul.id, userName: rahul.name, userRole: ROLE.ra, module: "Inspection Behaviour & Conduct", status: "completed", score: 88, completedAt: dPast(12), createdAt: dPast(30) },
      { tenantId: demo.id, inspectionId: i1.id, userId: anita.id, userName: anita.name, userRole: ROLE.csv, module: "Data Integrity / ALCOA+", status: "completed", score: 91, completedAt: dPast(10), createdAt: dPast(30) },
      { tenantId: demo.id, inspectionId: i1.id, userId: nisha.id, userName: nisha.name, userRole: ROLE.qc, module: "SOP-EC-447 Rev 3 — Environmental Controls", status: "completed", score: 78, completedAt: dPast(6), notes: "Passed, but scored lowest on the humidity-threshold decision tree — re-brief before the PAI.", createdAt: dPast(25) },
      { tenantId: demo.id, inspectionId: i1.id, userId: nisha.id, userName: nisha.name, userRole: ROLE.qc, module: "Data Integrity / ALCOA+", status: "pending", createdAt: dPast(25) },
      { tenantId: demo.id, inspectionId: i1.id, userId: vikram.id, userName: vikram.name, userRole: ROLE.it, module: "Data Integrity / ALCOA+", status: "pending", createdAt: dPast(25) },
      { tenantId: demo.id, inspectionId: i1.id, userId: sureshKumar.id, userName: sureshKumar.name, userRole: ROLE.ops, module: "Document Request Handling", status: "pending", createdAt: dPast(20) },
    ],
  });
  console.log("  1. FDA PAI Chennai (in 18 days) — 10 actions, 4 simulations, 7 training records");

  /* ═══ 2. EU GMP — Mumbai. Early stage, deliberately thin. ═══ */

  const i2 = await prisma.inspection.create({
    data: {
      tenantId: demo.id,
      title: TITLE.euMumbai,
      siteName: "Mumbai API Plant",
      agency: "EMA",
      type: "GMP Surveillance",
      status: "planning",
      expectedDate: dFut(64),
      inspectionLead: rahul.name,
      notes: "Routine 3-year re-inspection. Scope: API manufacturing, cleaning validation, supplier qualification.",
      createdBy: rahul.name,
      createdById: rahul.id,
      createdAt: dPast(12),
    },
  });

  await prisma.readinessAction.createMany({
    data: [
      { inspectionId: i2.id, title: "Nominate the inspection response team", lane: "People", bucket: "31-60 days", priority: "High", status: "Complete", owner: rahul.id, dueDate: dPast(2), completedBy: rahul.name, completedAt: dPast(3) },
      { inspectionId: i2.id, title: "Refresh cleaning-validation protocol package", lane: "Process", bucket: "31-60 days", priority: "High", status: "Not Started", owner: anita.id, dueDate: dFut(30) },
      { inspectionId: i2.id, title: "Compile supplier qualification dossiers", lane: "Documentation", bucket: "61-90 days", priority: "Medium", status: "Not Started", owner: sureshKumar.id, dueDate: dFut(55) },
      { inspectionId: i2.id, title: "Annex 11 gap review for the MES upgrade", lane: "Systems", bucket: "61-90 days", priority: "Medium", status: "Not Started", owner: vikram.id, dueDate: dFut(58) },
    ],
  });

  // Deliberately NO simulations — this is what fires the Overview
  // "No mock simulation scheduled yet." insight, so you can see the
  // insight engine react to an absence.
  await prisma.trainingRecord.createMany({
    data: [
      { tenantId: demo.id, inspectionId: i2.id, userId: rahul.id, userName: rahul.name, userRole: ROLE.ra, module: "EU GMP Annex 1 Awareness", status: "pending", createdAt: dPast(10) },
      { tenantId: demo.id, inspectionId: i2.id, userId: anita.id, userName: anita.name, userRole: ROLE.csv, module: "Cleaning Validation Principles", status: "pending", createdAt: dPast(10) },
      { tenantId: demo.id, inspectionId: i2.id, userId: sureshKumar.id, userName: sureshKumar.name, userRole: ROLE.ops, module: "Supplier Qualification Overview", status: "pending", createdAt: dPast(10) },
    ],
  });
  console.log("  2. EU GMP Mumbai (in 64 days) — 4 actions, 0 simulations (fires the insight), 3 training records");

  /* ═══ 3. WHO PQ — Bangalore. Closed; lands in the completed bucket. ═══ */

  const i3 = await prisma.inspection.create({
    data: {
      tenantId: demo.id,
      title: TITLE.whoBangalore,
      siteName: "Bangalore R&D Centre",
      agency: "WHO",
      type: "Prequalification",
      status: "completed",
      expectedDate: dPast(40),
      startDate: dPast(40),
      endDate: dPast(37),
      inspectionLead: priya.name,
      notes: "Closed with 2 minor observations, both addressed on site. No 483-equivalent issued.",
      createdBy: priya.name,
      createdById: priya.id,
      createdAt: dPast(120),
    },
  });

  await prisma.readinessAction.createMany({
    data: [
      { inspectionId: i3.id, title: "Prepare R&D data-integrity evidence pack", lane: "Data", bucket: "Immediate", priority: "High", status: "Complete", owner: vikram.id, dueDate: dPast(45), completedBy: vikram.name, completedAt: dPast(46) },
      { inspectionId: i3.id, title: "Rehearse stability-study questioning", lane: "People", bucket: "Immediate", priority: "Medium", status: "Complete", owner: nisha.id, dueDate: dPast(44), completedBy: nisha.name, completedAt: dPast(44) },
      { inspectionId: i3.id, title: "Finalise the R&D site master file annexe", lane: "Documentation", bucket: "Immediate", priority: "High", status: "Complete", owner: rahul.id, dueDate: dPast(42), completedBy: rahul.name, completedAt: dPast(43) },
    ],
  });

  await prisma.simulation.createMany({
    data: [
      { inspectionId: i3.id, title: "Mock WHO PQ Walkthrough", type: "Mock Inspection", duration: 150, scheduledAt: dPast(50), participants: "Dr. Priya Sharma, Vikram Singh, Dr. Nisha Rao", status: "Completed", score: 84, notes: "Ran clean. Stability-data questioning was the strongest section; minor hesitancy on the R&D-to-QC data handoff.", createdBy: priya.name, createdAt: dPast(60) },
    ],
  });

  await prisma.trainingRecord.createMany({
    data: [
      { tenantId: demo.id, inspectionId: i3.id, userId: vikram.id, userName: vikram.name, userRole: ROLE.it, module: "WHO PQ Expectations", status: "completed", score: 82, completedAt: dPast(52), createdAt: dPast(70) },
      { tenantId: demo.id, inspectionId: i3.id, userId: nisha.id, userName: nisha.name, userRole: ROLE.qc, module: "Stability Study Data Handling", status: "completed", score: 90, completedAt: dPast(51), createdAt: dPast(70) },
    ],
  });
  console.log("  3. WHO PQ Bangalore (closed, 40 days ago) — 3 actions, 1 simulation, 2 training records");

  // ── Verify ──
  const [insCount, actCount, simCount, trnCount] = await Promise.all([
    prisma.inspection.count({ where: { tenantId: demo.id } }),
    prisma.readinessAction.count({ where: { inspection: { tenantId: demo.id } } }),
    prisma.simulation.count({ where: { inspection: { tenantId: demo.id } } }),
    prisma.trainingRecord.count({ where: { tenantId: demo.id } }),
  ]);
  console.log("\nDone:", { inspections: insCount, actions: actCount, simulations: simCount, trainingRecords: trnCount });
  console.log("Log in as qa@pharmaglimmora.com / Demo@123 (Chennai) → Training & Awareness.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
