import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { BCRYPT_COST } from "../src/lib/passwords";
import { PLAN_TIERS } from "../src/lib/plans";
import { seedPlanRoleLimits } from "./roleLimitsSeed";
import { RESERVED_FRAMEWORKS } from "../src/constants/frameworks";
import { REGULATORY_REGIONS, GLOBAL_REGION_VALUE, GLOBAL_REGION_LABEL } from "../src/constants/regulatoryRegions";

const prisma = new PrismaClient();

/** Add N working days (skip Sat/Sun) — used for the fresh event's deadline. */
function addWorkingDays(from: Date, n: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

async function main() {
  console.log("Seeding database...");

  // Refresh passwordHash on every seed run so re-seeding heals hash drift
  // (manual edits, partial migrations, stale rows from earlier seed values).
  // Without this the upsert update branch was a no-op and login could
  // silently break with no way to recover short of `db:reset`.
  const superAdminHash = await bcrypt.hash("1", BCRYPT_COST);
  const demoHash = await bcrypt.hash("Admin@123", BCRYPT_COST);

  // ── Super Admin tenant ──
  const superAdmin = await prisma.tenant.upsert({
    where: { email: "superadmin@glimmora.com" },
    update: { passwordHash: superAdminHash, isActive: true },
    create: {
      customerCode: "SUPER_001",
      name: "Glimmora Platform",
      username: "superadmin",
      email: "superadmin@glimmora.com",
      passwordHash: superAdminHash,
      role: "super_admin",
      isActive: true,
    },
  });
  console.log("  Super admin:", superAdmin.id);

  // ── Demo customer tenant ──
  const demo = await prisma.tenant.upsert({
    where: { email: "admin@pharmaglimmora.com" },
    update: { passwordHash: demoHash, isActive: true },
    create: {
      customerCode: "PGI_001",
      name: "Pharma Glimmora International",
      username: "admin",
      email: "admin@pharmaglimmora.com",
      passwordHash: demoHash,
      role: "customer_admin",
      isActive: true,
    },
  });
  console.log("  Demo tenant:", demo.id);

  // ── Plan (Subscription Phase A) ──
  // Demo tenant is PROFESSIONAL. Caps are FROZEN onto the row from the tier
  // defaults (30 users / 5 sites / 3yr min retention).
  await prisma.plan.upsert({
    where: { tenantId: demo.id },
    update: {},
    create: {
      tenantId: demo.id,
      tier: "PROFESSIONAL",
      displayName: null,
      maxUsers: PLAN_TIERS.PROFESSIONAL.maxUsers,
      maxSites: PLAN_TIERS.PROFESSIONAL.maxSites,
      minRetentionYears: PLAN_TIERS.PROFESSIONAL.minRetentionYears,
      durationMonths: PLAN_TIERS.PROFESSIONAL.durationMonths,
      startDate: new Date("2026-01-01"),
      expiryDate: new Date("2026-12-31"),
    },
  });

  // ── Additional tenants: one per remaining tier so smoke tests can exercise
  // all four plans. Each gets a customer_admin (the tenant row itself), a
  // frozen plan, and a few users/sites kept comfortably under their caps. ──
  const tierHash = await bcrypt.hash("Admin@123", BCRYPT_COST);
  const extraTenants = [
    {
      code: "ESS_001", name: "Wellspring Generics", username: "wellspring", email: "admin@wellspring.test",
      tier: "ESSENTIALS" as const, displayName: null as string | null,
      caps: { maxUsers: PLAN_TIERS.ESSENTIALS.maxUsers, maxSites: PLAN_TIERS.ESSENTIALS.maxSites, minRetentionYears: PLAN_TIERS.ESSENTIALS.minRetentionYears, durationMonths: PLAN_TIERS.ESSENTIALS.durationMonths },
      sites: [{ name: "Pune Plant", code: "PUN" }],
      users: [
        { name: "Ravi Kumar", email: "ravi@wellspring.test", username: "ravi", role: "qa_head", gxpSignatory: true },
        // Phase 6 cleanup FIX 2 — SoD-viable QA: 2nd qa_head + a regulatory_affairs.
        { name: "Priya Desai", email: "priya@wellspring.test", username: "priya.desai", role: "qa_head", gxpSignatory: true },
        { name: "Karan Shah", email: "karan@wellspring.test", username: "karan.shah", role: "regulatory_affairs", gxpSignatory: true },
      ],
    },
    {
      code: "ENT_001", name: "Helios Biologics", username: "helios", email: "admin@helios.test",
      tier: "ENTERPRISE" as const, displayName: null as string | null,
      caps: { maxUsers: PLAN_TIERS.ENTERPRISE.maxUsers, maxSites: PLAN_TIERS.ENTERPRISE.maxSites, minRetentionYears: PLAN_TIERS.ENTERPRISE.minRetentionYears, durationMonths: PLAN_TIERS.ENTERPRISE.durationMonths },
      sites: [{ name: "Vizag Biologics", code: "VTZ" }, { name: "Goa Fill-Finish", code: "GOA" }],
      users: [
        { name: "Meera Nair", email: "meera@helios.test", username: "meera", role: "qa_head", gxpSignatory: true },
        { name: "Arjun Rao", email: "arjun@helios.test", username: "arjun", role: "csv_val_lead", gxpSignatory: true },
        // Phase 6 cleanup FIX 2 — SoD-viable QA: 2nd qa_head + a regulatory_affairs.
        { name: "Vivek Menon", email: "vivek@helios.test", username: "vivek.menon", role: "qa_head", gxpSignatory: true },
        { name: "Anjali Iyer", email: "anjali@helios.test", username: "anjali.iyer", role: "regulatory_affairs", gxpSignatory: true },
      ],
    },
    {
      code: "TLR_001", name: "Custom Pilot Pharma", username: "custompilot", email: "admin@custompilot.test",
      tier: "TAILORED" as const, displayName: "Custom Pilot" as string | null,
      caps: { maxUsers: 250, maxSites: 20, minRetentionYears: 10, durationMonths: 24 },
      sites: [{ name: "Ahmedabad Plant", code: "AMD" }],
      users: [
        { name: "Sana Shaikh", email: "sana@custompilot.test", username: "sana", role: "qa_head", gxpSignatory: true },
        // Phase 6 cleanup FIX 2 — SoD-viable QA: 2nd qa_head + a regulatory_affairs.
        { name: "Farah Khan", email: "farah@custompilot.test", username: "farah.khan", role: "qa_head", gxpSignatory: true },
        { name: "Imran Sheikh", email: "imran@custompilot.test", username: "imran.sheikh", role: "regulatory_affairs", gxpSignatory: true },
      ],
    },
  ];

  for (const t of extraTenants) {
    const tenant = await prisma.tenant.upsert({
      where: { email: t.email },
      update: { passwordHash: tierHash, isActive: true },
      create: {
        customerCode: t.code, name: t.name, username: t.username, email: t.email,
        passwordHash: tierHash, role: "customer_admin", isActive: true,
      },
    });
    await prisma.plan.upsert({
      where: { tenantId: tenant.id },
      update: {},
      create: {
        tenantId: tenant.id,
        tier: t.tier,
        displayName: t.displayName,
        maxUsers: t.caps.maxUsers,
        maxSites: t.caps.maxSites,
        minRetentionYears: t.caps.minRetentionYears,
        durationMonths: t.caps.durationMonths,
        startDate: new Date("2026-01-01"),
        expiryDate: new Date("2026-12-31"),
      },
    });
    for (const s of t.sites) {
      await prisma.site.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: s.name } },
        update: { code: s.code, isActive: true },
        create: { tenantId: tenant.id, name: s.name, code: s.code, risk: "MEDIUM" },
      });
    }
    for (const u of t.users) {
      await prisma.user.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email: u.email } },
        update: { isActive: true, role: u.role, gxpSignatory: u.gxpSignatory },
        create: {
          tenantId: tenant.id, name: u.name, email: u.email, username: u.username,
          passwordHash: tierHash, role: u.role, gxpSignatory: u.gxpSignatory,
        },
      });
    }
  }
  console.log("  Extra tier tenants:", extraTenants.map((t) => `${t.code}(${t.tier})`).join(", "));

  // Assign Helios to the EMA region so the region archive → auto-reassign
  // scenario (Stage 3) has a real in-use region to demonstrate. Idempotent:
  // only backfills when unset, so a later admin change is never clobbered.
  const heliosReassigned = await prisma.tenant.updateMany({
    where: { email: "admin@helios.test", regulatoryRegion: null },
    data: { regulatoryRegion: "EMA" },
  });
  if (heliosReassigned.count) console.log("  Helios → EMA region assigned");

  // ── Sites ──
  // Upsert keyed on (tenantId, name) so re-seeding doesn't duplicate rows.
  // Previously used `create`, which is why earlier reseeds left 12 site rows
  // (4 unique × 3) instead of 4.
  const sitesData = [
    // 3-letter `code` field drives the new reference scheme (e.g.
    // "DEV-CHN-2026-001"). Codes are stable once records reference
    // them — SitesTab enforces immutability after first use.
    { name: "Chennai QC Laboratory", code: "CHN", location: "Chennai, Tamil Nadu", gmpScope: "QC Testing", risk: "HIGH" },
    { name: "Mumbai API Plant", code: "MUM", location: "Mumbai, Maharashtra", gmpScope: "API Manufacturing", risk: "MEDIUM" },
    { name: "Bangalore R&D Centre", code: "BLR", location: "Bangalore, Karnataka", gmpScope: "R&D", risk: "MEDIUM" },
    { name: "Hyderabad Formulation", code: "HYD", location: "Hyderabad, Telangana", gmpScope: "Formulation", risk: "HIGH" },
  ] as const;
  const upsertedSites = await Promise.all(
    sitesData.map((s) =>
      prisma.site.upsert({
        where: { tenantId_name: { tenantId: demo.id, name: s.name } },
        update: { code: s.code, location: s.location, gmpScope: s.gmpScope, risk: s.risk, isActive: true },
        create: { tenantId: demo.id, name: s.name, code: s.code, location: s.location, gmpScope: s.gmpScope, risk: s.risk },
      }),
    ),
  );
  const [chennai, mumbai, bangalore, hyderabad] = upsertedSites;
  console.log("  Sites:", [chennai, mumbai, bangalore, hyderabad].map((s) => s.name).join(", "));

  // ── Users ──
  const users = [
    { name: "Dr. Priya Sharma", email: "qa@pharmaglimmora.com", username: "priya.sharma", role: "qa_head", gxpSignatory: true, siteId: chennai.id },
    { name: "Rahul Mehta", email: "ra@pharmaglimmora.com", username: "rahul.mehta", role: "regulatory_affairs", gxpSignatory: true, siteId: mumbai.id },
    { name: "Anita Patel", email: "csv@pharmaglimmora.com", username: "anita.patel", role: "csv_val_lead", gxpSignatory: true, siteId: chennai.id },
    { name: "Dr. Nisha Rao", email: "qc@pharmaglimmora.com", username: "nisha.rao", role: "qc_lab_director", gxpSignatory: true, siteId: chennai.id },
    { name: "Vikram Singh", email: "it@pharmaglimmora.com", username: "vikram.singh", role: "it_cdo", gxpSignatory: false, siteId: bangalore.id },
    { name: "Suresh Kumar", email: "ops@pharmaglimmora.com", username: "suresh.kumar", role: "operations_head", gxpSignatory: false, siteId: hyderabad.id },
    // Substage 5.2 — second qa_head + second regulatory_affairs. The
    // simplified Critical tier needs 1 qa_head + 1 regulatory_affairs;
    // keeping a second qa_head (Suresh) gives us 2 total so the
    // distinct-user dedup ("same person can't approve twice on a single
    // CAPA") is still testable. Sanjay (ra2) is symmetric on the RA side.
    { name: "Dr. Suresh Iyer", email: "qa2@pharmaglimmora.com", username: "suresh.iyer", role: "qa_head", gxpSignatory: true, siteId: chennai.id },
    { name: "Sanjay Verma", email: "ra2@pharmaglimmora.com", username: "sanjay.verma", role: "regulatory_affairs", gxpSignatory: true, siteId: bangalore.id },
    // Execution-level QA test user — non-privileged observer/executor. Distinct
    // from the qa_head accounts above: role "qa", gxpSignatory false (no
    // e-signature), so it can never approve/sign/close/delete. Email/username
    // kept distinct from priya.sharma's qa@... (qa_head) to avoid a collision.
    { name: "QA Test User", email: "qa.exec@pharmaglimmora.com", username: "qa.exec", role: "qa", gxpSignatory: false, siteId: chennai.id },
  ];
  // Hash once — bcrypt generates a fresh random salt per call, so calling it
  // inside the loop wasted CPU and made re-runs slower than necessary.
  const userPasswordHash = await bcrypt.hash("Demo@123", BCRYPT_COST);
  for (const u of users) {
    await prisma.user.upsert({
      where: {
        tenantId_username: { tenantId: demo.id, username: u.username },
      },
      update: {
        name: u.name,
        email: u.email,
        role: u.role,
        gxpSignatory: u.gxpSignatory,
        siteId: u.siteId,
        isActive: true,
        passwordHash: userPasswordHash,
      },
      create: {
        ...u,
        tenantId: demo.id,
        passwordHash: userPasswordHash,
        isActive: true,
      },
    });
  }
  console.log("  Users:", users.length);

  /* ═══════════════════════════════════════════════════════════════
   * FDA 483 — wipe + reseed demo data (4 lifecycle-stage events)
   * ═══════════════════════════════════════════════════════════════ */

  // ── Wipe (scoped to FDA 483 + its derivative CAPAs only) ──
  // NOTE: the AuditLog module value is "FDA 483" (with a space), not
  // "FDA_483" — matched to what the app actually writes.
  const wipe = await prisma.$transaction([
    prisma.auditLog.deleteMany({ where: { module: "FDA 483" } }),
    prisma.fDA483Document.deleteMany({}),
    prisma.fDA483Commitment.deleteMany({}),
    // No FK on observation.capaId, but unlink first for cleanliness.
    prisma.fDA483Observation.updateMany({ data: { capaId: null } }),
    prisma.cAPA.deleteMany({ where: { source: "FDA 483" } }),
    prisma.fDA483Observation.deleteMany({}),
    prisma.fDA483Event.deleteMany({}),
  ]);
  console.log("  FDA 483 wiped:", {
    audit: wipe[0].count,
    documents: wipe[1].count,
    commitments: wipe[2].count,
    capasUnlinkedFromObs: wipe[3].count,
    capas: wipe[4].count,
    observations: wipe[5].count,
    events: wipe[6].count,
  });

  // ── Resolve compliance users (created above) ──
  const allUsers = await prisma.user.findMany({ where: { tenantId: demo.id } });
  const byUser = (username: string) => {
    const found = allUsers.find((x) => x.username === username);
    if (!found) throw new Error(`Seed: expected user ${username} not found`);
    return found;
  };
  const priya = byUser("priya.sharma"); // qa_head — RCA author / internal owner
  const sureshIyer = byUser("suresh.iyer"); // qa_head #2 — RCA reviewer (SoD)
  const anita = byUser("anita.patel"); // csv lead — CAPA owner / E4 owner
  const nisha = byUser("nisha.rao"); // qc director — commitment owner
  const rahul = byUser("rahul.mehta"); // RA — CAPA owner

  const today = new Date("2026-05-31T00:00:00Z");

  // Audit rows accumulate here and are inserted once at the end.
  const auditRows: Prisma.AuditLogCreateManyInput[] = [];
  const audit = (
    action: string,
    recordId: string,
    createdAt: string,
    extra: Partial<Prisma.AuditLogCreateManyInput> = {},
  ) =>
    auditRows.push({
      tenantId: demo.id,
      userId: priya.id,
      userName: priya.name,
      userRole: "qa_head",
      module: "FDA 483",
      action,
      recordId,
      createdAt: new Date(createdAt),
      ...extra,
    });

  /* ── EVENT 1 — Fully submitted (terminal, full history) ── */
  const e1 = await prisma.fDA483Event.create({
    data: {
      tenantId: demo.id,
      referenceNumber: "483-CHN-2026-001",
      eventType: "FDA 483",
      agency: "FDA",
      siteId: bangalore.id,
      inspectionDate: new Date("2026-04-13"),
      inspectionEndDate: new Date("2026-04-17"),
      leadInvestigator: "Dr. James Smith",
      internalOwnerId: priya.id,
      responseDeadline: new Date("2026-05-08"),
      status: "Response Submitted",
      agiDraft:
        "Dear FDA District Office,\n\nPharma Glimmora International received Form FDA-483 issued at the conclusion of the inspection of our Bangalore R&D Centre facility on 17 April 2026. We appreciate the opportunity to respond to the observations cited in the form.\n\nWe have completed thorough root cause analysis and initiated corrective and preventive actions (CAPAs) for each observation, as summarized below.\n\nObservation #1: Procedural deviation in batch records — operator judgment on humidity-borderline readings.\nRoot Cause: Procedure inadequately specifies thresholds, leading to operator judgment calls under varying conditions.\nCorrective Action: CAPA-CHN-2026-001 has been raised; SOP-EC-447 revision, targeted training and effectiveness verification within 90 days.\n\nObservation #2: Equipment qualification interval exceeded the 12-month SOP requirement.\nRoot Cause: Qualification scheduling relied on a manual tracking process that did not flag the overdue equipment.\nCorrective Action: CAPA-CHN-2026-002 has been raised; automated qualification scheduling with escalation alerts.\n\nObservation #3: Training records incomplete for a recent SOP revision.\nRoot Cause: Training system did not enforce SOP-version association with completion records.\nCorrective Action: CAPA-CHN-2026-003 has been raised; LMS version-gating control.\n\nWe are committed to continuous improvement of our quality systems and will provide periodic updates on the effectiveness of these corrective actions.\n\nSincerely,\n\nDr. Priya Sharma, QA Head\nPharma Glimmora International",
      submittedAt: new Date("2026-05-06"),
      submittedBy: priya.name,
      signatureMeaning: "Approval",
      createdBy: priya.name,
      createdAt: new Date("2026-04-15"),
    },
  });

  const e1capa1 = await prisma.cAPA.create({
    data: {
      tenantId: demo.id,
      reference: "CAPA-CHN-2026-001",
      title: "Revise SOP-EC-447 humidity threshold specification",
      source: "FDA 483",
      siteId: bangalore.id,
      description: "483-CHN-2026-001 Obs #1: Revise SOP-EC-447 to specify numeric humidity thresholds and eliminate operator judgment on borderline readings.",
      risk: "Critical",
      owner: anita.id,
      dueDate: new Date("2026-06-17"),
      status: "in_progress",
      rca: "Procedure inadequately specifies thresholds, leading to operator judgment calls under varying conditions.",
      rcaMethod: "5 Why",
      rcaApproved: true,
      rcaReviewedBy: sureshIyer.name,
      rcaReviewedById: sureshIyer.id,
      rcaReviewedAt: new Date("2026-04-24"),
      rcaReviewNotes: "RCA traced to a genuine procedural gap; threshold specification is the correct corrective focus.",
      createdBy: priya.name,
      createdAt: new Date("2026-04-22"),
    },
  });
  const e1capa2 = await prisma.cAPA.create({
    data: {
      tenantId: demo.id,
      reference: "CAPA-CHN-2026-002",
      title: "Automate equipment requalification scheduling + alerts",
      source: "FDA 483",
      siteId: bangalore.id,
      description: "483-CHN-2026-001 Obs #2: Implement automated equipment requalification scheduling with overdue-escalation alerts.",
      risk: "High",
      owner: rahul.id,
      dueDate: new Date("2026-06-03"),
      status: "in_progress",
      rca: "Qualification scheduling system did not flag the overdue equipment due to manual tracking process.",
      rcaMethod: "Fishbone",
      rcaApproved: true,
      rcaReviewedBy: sureshIyer.name,
      rcaReviewedById: sureshIyer.id,
      rcaReviewedAt: new Date("2026-04-24"),
      createdBy: priya.name,
      createdAt: new Date("2026-04-22"),
    },
  });
  const e1capa3 = await prisma.cAPA.create({
    data: {
      tenantId: demo.id,
      reference: "CAPA-CHN-2026-003",
      title: "Enforce SOP-version link in LMS training records",
      source: "FDA 483",
      siteId: bangalore.id,
      description: "483-CHN-2026-001 Obs #3: Enforce SOP-version association with training completion records in the LMS.",
      risk: "Medium",
      owner: nisha.id,
      dueDate: new Date("2026-07-01"),
      status: "in_progress",
      rca: "Training tracking system did not enforce the SOP version association with completion records.",
      rcaMethod: "Fault Tree",
      rcaApproved: true,
      rcaReviewedBy: sureshIyer.name,
      rcaReviewedById: sureshIyer.id,
      rcaReviewedAt: new Date("2026-04-25"),
      createdBy: priya.name,
      createdAt: new Date("2026-04-23"),
    },
  });

  await prisma.fDA483Observation.createMany({
    data: [
      {
        eventId: e1.id, reference: "483-BLR-2026-001", number: 1,
        text: "Procedural deviation in batch records. Operator made judgment calls on humidity-borderline readings.",
        severity: "Critical", area: "QC Lab", regulation: "21 CFR 211.68",
        rcaMethod: "5 Why",
        rootCause: "Why 1: Operators recorded humidity-borderline readings using personal judgment rather than a defined rule.\nWhy 2: The batch record gave no explicit pass/fail threshold for borderline humidity values.\nWhy 3: SOP-EC-447 referenced an \"acceptable range\" without numeric cut-offs or a borderline-handling step.\nWhy 4: The SOP predated the current humidity-sensitive product and was never revised for it.\nWhy 5: Procedure inadequately specifies thresholds, leading to operator judgment calls under varying conditions.",
        capaId: e1capa1.id, status: "Response Drafted",
      },
      {
        eventId: e1.id, reference: "483-BLR-2026-002", number: 2,
        text: "Equipment qualification interval was last performed 18 months ago, exceeding the 12-month SOP requirement.",
        severity: "High", area: "Manufacturing", regulation: "21 CFR 211.100",
        rcaMethod: "Fishbone",
        rootCause: "People: Engineering coordinator tracked qualification dates personally, with no backup during absence.\nProcess: Requalification scheduling relied on a manual spreadsheet with no automated due-date escalation.\nEquipment: The asset carried no qualification tag linking it to a managed schedule.\nMaterials: No material factor identified.\nEnvironment: Competing capacity demands repeatedly pushed planned-maintenance windows.\nManagement: The qualification due-list was not reviewed at the quality management review.\n\nRoot cause: Qualification scheduling system did not flag the overdue equipment due to manual tracking process.",
        capaId: e1capa2.id, status: "Response Drafted",
      },
      {
        eventId: e1.id, reference: "483-BLR-2026-003", number: 3,
        text: "Training records for 2 QC analysts incomplete for recent SOP revision.",
        severity: "Low", area: "Documentation", regulation: "21 CFR 211.22",
        rcaMethod: "Fault Tree",
        rootCause: "Training tracking system did not enforce the SOP version association with completion records.",
        capaId: e1capa3.id, status: "Response Drafted",
      },
    ],
  });

  await prisma.fDA483Commitment.createMany({
    data: [
      { eventId: e1.id, text: "Complete revision of SOP-EC-447 and validate", dueDate: new Date("2026-06-30"), owner: anita.id, status: "Pending" },
      { eventId: e1.id, text: "Quarterly humidity monitoring data review for 90 days", dueDate: new Date("2026-07-31"), owner: nisha.id, status: "Pending" },
    ],
  });

  await prisma.fDA483Document.create({
    data: {
      eventId: e1.id,
      fileName: "Response-Package-483-CHN-2026-001.pdf",
      fileUrl: "/uploads/fda483/Response-Package-483-CHN-2026-001.pdf",
      fileType: "pdf",
      fileSize: "2.4 MB",
      type: "response",
      uploadedBy: priya.name,
      createdAt: new Date("2026-05-05"),
    },
  });

  // Part 11 signature ledger row + link from the event.
  const e1sig = await prisma.signedRecord.create({
    data: {
      tenantId: demo.id,
      recordType: "FDA483_RESPONSE",
      recordId: e1.id,
      signerId: priya.id,
      signerName: priya.name,
      signerRole: "qa_head",
      signerEmail: priya.email,
      signatureMeaning: "Approval",
      contentHash: "9f2c1a7b4e6d8c0f3a5b2e1d7c9048fa6b3e2d1c5a7f9b0e4d6c8a1f2b3c4d5e",
      contentSummary: "FDA 483 response 483-CHN-2026-001 submitted by Dr. Priya Sharma (qa_head) — meaning: Approval",
      passwordVerifiedAt: new Date("2026-05-06"),
      createdAt: new Date("2026-05-06"),
    },
  });
  await prisma.fDA483Event.update({
    where: { id: e1.id },
    data: { responseSignatureId: e1sig.id },
  });

  // E1 audit lifecycle (15 Apr → 6 May).
  audit("FDA483_EVENT_REGISTERED", e1.id, "2026-04-15", { recordTitle: "483-CHN-2026-001" });
  audit("OBSERVATION_ADDED", e1.id, "2026-04-16", { recordTitle: "Observation #1" });
  audit("OBSERVATION_ADDED", e1.id, "2026-04-16", { recordTitle: "Observation #2" });
  audit("OBSERVATION_ADDED", e1.id, "2026-04-16", { recordTitle: "Observation #3" });
  audit("OBSERVATION_RCA_COMPLETED", e1.id, "2026-04-20", { recordTitle: "Observation #1 — 5 Why" });
  audit("OBSERVATION_RCA_COMPLETED", e1.id, "2026-04-20", { recordTitle: "Observation #2 — Fishbone" });
  audit("OBSERVATION_RCA_COMPLETED", e1.id, "2026-04-21", { recordTitle: "Observation #3 — Fault Tree" });
  audit("CAPA_RAISED_FROM_OBSERVATION", e1.id, "2026-04-22", { recordTitle: "CAPA-CHN-2026-001", newValue: e1capa1.id });
  audit("CAPA_RAISED_FROM_OBSERVATION", e1.id, "2026-04-22", { recordTitle: "CAPA-CHN-2026-002", newValue: e1capa2.id });
  audit("CAPA_RAISED_FROM_OBSERVATION", e1.id, "2026-04-23", { recordTitle: "CAPA-CHN-2026-003", newValue: e1capa3.id });
  audit("CAPA_RCA_APPROVED", e1capa1.id, "2026-04-24", { userId: sureshIyer.id, userName: sureshIyer.name, recordTitle: "CAPA-CHN-2026-001" });
  audit("CAPA_RCA_APPROVED", e1capa2.id, "2026-04-24", { userId: sureshIyer.id, userName: sureshIyer.name, recordTitle: "CAPA-CHN-2026-002" });
  audit("CAPA_RCA_APPROVED", e1capa3.id, "2026-04-25", { userId: sureshIyer.id, userName: sureshIyer.name, recordTitle: "CAPA-CHN-2026-003" });
  audit("COMMITMENT_ADDED", e1.id, "2026-04-28", { recordTitle: "Revise SOP-EC-447" });
  audit("COMMITMENT_ADDED", e1.id, "2026-04-28", { recordTitle: "Quarterly humidity review" });
  audit("AGI_DRAFT_SAVED", e1.id, "2026-05-02", { recordTitle: "483-CHN-2026-001" });
  audit("RESPONSE_DOCUMENT_ADDED", e1.id, "2026-05-05", { recordTitle: "Response-Package-483-CHN-2026-001.pdf" });
  audit("RESPONSE_SIGNED", e1.id, "2026-05-06", {
    recordTitle: "483-CHN-2026-001",
    newValue: JSON.stringify({ signerId: priya.id, meaning: "Approval", contentHashPrefix: "9f2c1a7b4e6d8c0f" }),
  });

  /* ── EVENT 2 — Active response in progress ── */
  const e2 = await prisma.fDA483Event.create({
    data: {
      tenantId: demo.id,
      referenceNumber: "483-MUM-2026-002",
      eventType: "FDA 483",
      agency: "FDA",
      siteId: mumbai.id,
      inspectionDate: new Date("2026-05-08"),
      inspectionEndDate: new Date("2026-05-12"),
      leadInvestigator: "Inspector Maria Gomez",
      internalOwnerId: priya.id,
      responseDeadline: new Date("2026-06-02"),
      status: "Under Investigation",
      createdBy: priya.name,
      createdAt: new Date("2026-05-13"),
    },
  });
  const e2capa1 = await prisma.cAPA.create({
    data: {
      tenantId: demo.id, reference: "CAPA-MUM-2026-001", title: "Re-qualify HVAC pressure cascade + continuous monitoring", source: "FDA 483", siteId: mumbai.id,
      description: "483-MUM-2026-002 Obs #1: Re-qualify HVAC pressure cascade and add continuous differential-pressure alarming on the fill line.",
      risk: "Critical", owner: anita.id, dueDate: new Date("2026-06-19"), status: "in_progress",
      rca: "Pressure-cascade interlock setpoints were not revalidated after the AHU service in March, so the differential drifted below the qualified range during dynamic filling.",
      rcaMethod: "5 Why",
      rcaApproved: true, rcaReviewedBy: sureshIyer.name, rcaReviewedById: sureshIyer.id, rcaReviewedAt: new Date("2026-05-18"),
      createdBy: priya.name, createdAt: new Date("2026-05-16"),
    },
  });
  const e2capa2 = await prisma.cAPA.create({
    data: {
      tenantId: demo.id, reference: "CAPA-MUM-2026-002", title: "Automated stability-pull scheduling with escalation", source: "FDA 483", siteId: mumbai.id,
      description: "483-MUM-2026-002 Obs #2: Add automated stability-pull scheduling with overdue escalation to prevent interval excursions.",
      risk: "High", owner: nisha.id, dueDate: new Date("2026-07-03"), status: "in_progress",
      rca: "Stability pull scheduling was tracked manually on a spreadsheet with no escalation, so a 5-day slip on batch B-2026-018 went unnoticed.",
      rcaMethod: "Fishbone",
      rcaApproved: true, rcaReviewedBy: sureshIyer.name, rcaReviewedById: sureshIyer.id, rcaReviewedAt: new Date("2026-05-19"),
      createdBy: priya.name, createdAt: new Date("2026-05-17"),
    },
  });
  await prisma.fDA483Observation.createMany({
    data: [
      {
        eventId: e2.id, reference: "483-MUM-2026-001", number: 1,
        text: "HVAC pressure differential outside qualified range during filling operation on 9 May 2026.",
        severity: "Critical", area: "Sterile Manufacturing", regulation: "21 CFR 211.42",
        rcaMethod: "5 Why",
        rootCause: "Why 1: The room-to-room pressure differential fell below the qualified minimum during the filling run.\nWhy 2: The pressure-cascade interlock was holding a setpoint lower than the qualified value.\nWhy 3: Setpoints were not re-verified when the AHU returned to service after its March maintenance.\nWhy 4: The AHU service work order had no \"revalidate interlock setpoints\" closure step.\nWhy 5: Pressure-cascade interlock setpoints were not revalidated after the AHU service in March, so the differential drifted below the qualified range during dynamic filling.",
        capaId: e2capa1.id, status: "CAPA Linked",
      },
      {
        eventId: e2.id, reference: "483-MUM-2026-002", number: 2,
        text: "Stability sample testing exceeded SOP-defined interval by 5 days for batch B-2026-018.",
        severity: "High", area: "QC", regulation: "21 CFR 211.165",
        rcaMethod: "Fishbone",
        rootCause: "People: The stability coordinator carried the pull schedule manually and missed the B-2026-018 window.\nProcess: Pull-due dates had no automated reminder or overdue escalation.\nEquipment: The LIMS stability module was not configured to enforce pull windows.\nMaterials: No material factor identified.\nEnvironment: A high concurrent study load increased the chance of a missed pull.\nManagement: Stability-schedule adherence was not a tracked QC metric.\n\nRoot cause: Stability pull scheduling was tracked manually on a spreadsheet with no escalation, so a 5-day slip on batch B-2026-018 went unnoticed.",
        capaId: e2capa2.id, status: "CAPA Linked",
      },
      {
        eventId: e2.id, reference: "483-MUM-2026-003", number: 3,
        text: "Cleaning validation protocol does not address residue limits for product changeovers between API families.",
        severity: "Low", area: "Cleaning Validation", regulation: "21 CFR 211.67",
        status: "In Progress",
      },
      {
        eventId: e2.id, reference: "483-MUM-2026-004", number: 4,
        text: "Batch record review signature dates not consistently formatted across the manufacturing record.",
        severity: "Low", area: "Documentation", regulation: "21 CFR 211.188",
        status: "Open",
      },
    ],
  });
  await prisma.fDA483Commitment.create({
    data: { eventId: e2.id, text: "Complete RCA on remaining observations (3, 4)", dueDate: new Date("2026-05-22"), owner: priya.id, status: "Pending" },
  });
  audit("FDA483_EVENT_REGISTERED", e2.id, "2026-05-13", { recordTitle: "483-MUM-2026-002" });
  audit("OBSERVATION_ADDED", e2.id, "2026-05-14", { recordTitle: "Observation #1" });
  audit("OBSERVATION_ADDED", e2.id, "2026-05-14", { recordTitle: "Observation #2" });
  audit("OBSERVATION_ADDED", e2.id, "2026-05-14", { recordTitle: "Observation #3" });
  audit("OBSERVATION_ADDED", e2.id, "2026-05-14", { recordTitle: "Observation #4" });
  audit("OBSERVATION_RCA_COMPLETED", e2.id, "2026-05-16", { recordTitle: "Observation #1 — 5 Why" });
  audit("OBSERVATION_RCA_COMPLETED", e2.id, "2026-05-17", { recordTitle: "Observation #2 — Fishbone" });
  audit("CAPA_RAISED_FROM_OBSERVATION", e2.id, "2026-05-16", { recordTitle: "CAPA-MUM-2026-001", newValue: e2capa1.id });
  audit("CAPA_RAISED_FROM_OBSERVATION", e2.id, "2026-05-17", { recordTitle: "CAPA-MUM-2026-002", newValue: e2capa2.id });
  audit("CAPA_RCA_APPROVED", e2capa1.id, "2026-05-18", { userId: sureshIyer.id, userName: sureshIyer.name, recordTitle: "CAPA-MUM-2026-001" });
  audit("CAPA_RCA_APPROVED", e2capa2.id, "2026-05-19", { userId: sureshIyer.id, userName: sureshIyer.name, recordTitle: "CAPA-MUM-2026-002" });
  audit("COMMITMENT_ADDED", e2.id, "2026-05-20", { recordTitle: "Complete RCA on remaining observations" });

  /* ── EVENT 3 — Warning Letter ── */
  const e3 = await prisma.fDA483Event.create({
    data: {
      tenantId: demo.id,
      referenceNumber: "WL-MUM-2026-001",
      eventType: "Warning Letter",
      agency: "FDA",
      siteId: mumbai.id,
      inspectionDate: new Date("2026-03-01"),
      inspectionEndDate: null,
      leadInvestigator: null,
      internalOwnerId: priya.id,
      responseDeadline: new Date("2026-04-16"),
      status: "Under Investigation",
      createdBy: priya.name,
      createdAt: new Date("2026-03-02"),
    },
  });
  const e3capa1 = await prisma.cAPA.create({
    data: {
      tenantId: demo.id, reference: "CAPA-MUM-2026-003", title: "Restrict LIMS admin access + persistent audit logging", source: "FDA 483", siteId: mumbai.id,
      description: "WL-MUM-2026-001 Obs #1: Restrict LIMS administrative access and enforce persistent, tamper-evident audit logging of QC result changes.",
      risk: "Critical", owner: anita.id, dueDate: new Date("2026-05-30"), status: "in_progress",
      rca: "LIMS administrator role was over-scoped and audit-trail logging could be disabled, so privileged users could modify results without a persistent record.",
      rcaMethod: "5 Why",
      rcaApproved: true, rcaReviewedBy: sureshIyer.name, rcaReviewedById: sureshIyer.id, rcaReviewedAt: new Date("2026-03-12"),
      diGate: true, diGateStatus: "pending",
      createdBy: priya.name, createdAt: new Date("2026-03-10"),
    },
  });
  const e3capa2 = await prisma.cAPA.create({
    data: {
      tenantId: demo.id, reference: "CAPA-MUM-2026-004", title: "LIMS audit-trail CSV risk assessment", source: "FDA 483", siteId: mumbai.id,
      description: "WL-MUM-2026-001 Obs #2: Complete CSV risk assessment for the LIMS audit-trail function and update validation documentation.",
      risk: "High", owner: rahul.id, dueDate: new Date("2026-06-15"), status: "in_progress",
      rca: "The original LIMS CSV package predated current data-integrity expectations and never assessed the audit-trail function as a risk-bearing control.",
      rcaMethod: "Fishbone",
      rcaApproved: true, rcaReviewedBy: sureshIyer.name, rcaReviewedById: sureshIyer.id, rcaReviewedAt: new Date("2026-03-13"),
      createdBy: priya.name, createdAt: new Date("2026-03-11"),
    },
  });
  await prisma.fDA483Observation.createMany({
    data: [
      {
        eventId: e3.id, reference: "WL-MUM-2026-001-OBS1", number: 1,
        text: "Inadequate access controls on the LIMS audit trail allow administrative users to modify QC test results without persistent audit logging.",
        severity: "Critical", area: "Data Integrity", regulation: "21 CFR Part 11",
        rcaMethod: "5 Why",
        rootCause: "Why 1: Administrative users could change QC results without a tamper-evident record being kept.\nWhy 2: The LIMS audit-trail function could be switched off by holders of the admin role.\nWhy 3: The administrator role bundled data-entry and configuration rights with audit-trail control.\nWhy 4: Roles were configured at go-live for convenience, without least-privilege segregation.\nWhy 5: LIMS administrator role was over-scoped and audit-trail logging could be disabled, so privileged users could modify results without a persistent record.",
        capaId: e3capa1.id, status: "CAPA Linked",
      },
      {
        eventId: e3.id, reference: "WL-MUM-2026-001-OBS2", number: 2,
        text: "Computer system validation documentation for the LIMS is missing risk assessment for the audit trail function.",
        severity: "High", area: "CSV", regulation: "EU GMP Annex 11",
        rcaMethod: "Fishbone",
        rootCause: "People: The original validation author treated the audit trail as a passive log, not a GMP control.\nProcess: The CSV risk assessment had no data-integrity-specific evaluation step.\nEquipment: The LIMS audit-trail configuration sat outside the validated-function boundary.\nMaterials: No material factor identified.\nEnvironment: The system was validated before data-integrity guidance matured.\nManagement: No periodic CSV re-assessment was triggered when DI expectations changed.\n\nRoot cause: The original LIMS CSV package predated current data-integrity expectations and never assessed the audit-trail function as a risk-bearing control.",
        capaId: e3capa2.id, status: "CAPA Linked",
      },
    ],
  });
  await prisma.fDA483Commitment.create({
    data: { eventId: e3.id, text: "Engage external CSV consultant for LIMS audit trail assessment", dueDate: new Date("2026-06-30"), owner: rahul.id, status: "Pending" },
  });
  audit("FDA483_EVENT_REGISTERED", e3.id, "2026-03-02", { recordTitle: "WL-MUM-2026-001" });
  audit("OBSERVATION_ADDED", e3.id, "2026-03-04", { recordTitle: "Observation #1" });
  audit("OBSERVATION_ADDED", e3.id, "2026-03-04", { recordTitle: "Observation #2" });
  audit("OBSERVATION_RCA_COMPLETED", e3.id, "2026-03-09", { recordTitle: "Observation #1 — 5 Why" });
  audit("OBSERVATION_RCA_COMPLETED", e3.id, "2026-03-10", { recordTitle: "Observation #2 — Fishbone" });
  audit("CAPA_RAISED_FROM_OBSERVATION", e3.id, "2026-03-10", { recordTitle: "CAPA-MUM-2026-003", newValue: e3capa1.id });
  audit("CAPA_RAISED_FROM_OBSERVATION", e3.id, "2026-03-11", { recordTitle: "CAPA-MUM-2026-004", newValue: e3capa2.id });
  audit("CAPA_RCA_APPROVED", e3capa1.id, "2026-03-12", { userId: sureshIyer.id, userName: sureshIyer.name, recordTitle: "CAPA-MUM-2026-003" });
  audit("CAPA_RCA_APPROVED", e3capa2.id, "2026-03-13", { userId: sureshIyer.id, userName: sureshIyer.name, recordTitle: "CAPA-MUM-2026-004" });
  audit("COMMITMENT_ADDED", e3.id, "2026-03-16", { recordTitle: "Engage external CSV consultant" });

  /* ═══════════════════════════════════════════════════════════════
   * Phase 6 — QA-screen fixtures (so queues / Worklist / detail are seeable).
   * Existing seed above is untouched; this only enriches three e1 CAPAs.
   * ═══════════════════════════════════════════════════════════════ */
  const sureshKumar = byUser("suresh.kumar"); // operations_head — a non-author fixer
  const EV_CATS = [
    "BATCH_RECORDS", "TRAINING_RECORDS", "EQUIPMENT_LOGS", "ENVIRONMENTAL_DATA",
    "DEVIATION_HISTORY", "WITNESS_INTERVIEWS", "SUPPLIER_DATA",
  ];
  const nowFix = new Date("2026-06-08T00:00:00Z");
  const dPast = (n: number) => new Date(nowFix.getTime() - n * 86400000);
  const dFut = (n: number) => new Date(nowFix.getTime() + n * 86400000);
  const initEvidence = async (capaId: string) => {
    await prisma.evidenceItem.createMany({
      data: EV_CATS.map((category) => ({ capaId, category, status: "PENDING", createdBy: priya.name })),
    });
    return prisma.evidenceItem.findMany({ where: { capaId }, orderBy: { category: "asc" } });
  };

  // Authoritative driver/creator FKs on every demo CAPA (the create calls above
  // predate ownerId/createdById; set them here so owner/driver paths work after
  // a fresh reseed exactly as they do after the Phase-3 backfill).
  const demoCapaOwners: Array<[{ id: string }, { id: string }]> = [
    [e1capa1, anita], [e1capa2, rahul], [e1capa3, nisha],
    [e2capa1, anita], [e2capa2, nisha], [e3capa1, anita], [e3capa2, rahul],
  ];
  for (const [capa, ownerUser] of demoCapaOwners) {
    await prisma.cAPA.update({ where: { id: capa.id }, data: { ownerId: ownerUser.id, createdById: priya.id } });
  }

  // ── Fixture 1: e1capa2 (driver Rahul) — READY, sitting pending_qa_review.
  await prisma.cAPA.update({
    where: { id: e1capa2.id },
    data: {
      status: "pending_qa_review", diGate: false,
      alignmentStatus: "aligned", alignmentReviewedBy: sureshIyer.name,
      alignmentReviewedById: sureshIyer.id, alignmentReviewedAt: dPast(20),
    },
  });
  await prisma.cAPAActionItem.createMany({
    data: [
      { capaId: e1capa2.id, tenantId: demo.id, sequence: 1, description: "Configure automated requalification schedule in the CMMS", owner: nisha.name, ownerId: nisha.id, dueDate: dPast(6), status: "complete", completionNotes: "Schedule configured and verified against the equipment master list.", completedBy: nisha.name, completedById: nisha.id, completedAt: dPast(4), createdBy: priya.name, createdById: priya.id },
      { capaId: e1capa2.id, tenantId: demo.id, sequence: 2, description: "Enable overdue-escalation email alerts to QA", owner: sureshKumar.name, ownerId: sureshKumar.id, dueDate: dPast(3), status: "complete", completionNotes: "Alerts enabled; QA distribution list received the test escalation.", completedBy: sureshKumar.name, completedById: sureshKumar.id, completedAt: dPast(2), createdBy: priya.name, createdById: priya.id },
    ],
  });
  const ev2 = await initEvidence(e1capa2.id);
  await prisma.evidenceItem.updateMany({ where: { capaId: e1capa2.id }, data: { status: "COMPLETE" } });
  await prisma.evidenceFile.create({
    data: { evidenceItemId: ev2[0].id, fileName: "requal-schedule.pdf", originalFileName: "requal-schedule.pdf", fileSize: 24576, fileType: "application/pdf", fileExtension: ".pdf", fileUrl: "seed://requal-schedule.pdf", contentHashSha256: "seedhash-e1capa2-001", retainUntil: dFut(2555), uploadedBy: nisha.name, uploadedById: nisha.id },
  });
  await prisma.cAPAEffectivenessCriterion.create({
    data: { capaId: e1capa2.id, tenantId: demo.id, description: "Zero overdue requalifications for 90 days post-implementation", targetMetric: "Overdue requalification count", measurementMethod: "CMMS overdue report", targetValue: "0", monitoringPeriod: "90 days", createdBy: priya.name },
  });

  // ── Fixture 2: e1capa3 (driver Nisha) — bounced back, one item in REWORK.
  await prisma.cAPA.update({
    where: { id: e1capa3.id },
    data: { status: "in_progress", rejectionReason: "Training-record linkage evidence is insufficient — attach the LMS export showing SOP-version association.", rejectedById: priya.id, rejectedAt: dPast(2) },
  });
  await prisma.cAPAActionItem.createMany({
    data: [
      { capaId: e1capa3.id, tenantId: demo.id, sequence: 1, description: "Enforce SOP-version ↔ training-record association in the LMS", owner: nisha.name, ownerId: nisha.id, dueDate: dPast(1), status: "rework", reworkReason: "Training-record linkage evidence is insufficient — attach the LMS export showing SOP-version association.", reworkRequestedById: priya.id, reworkRequestedAt: dPast(2), createdBy: priya.name, createdById: priya.id },
      { capaId: e1capa3.id, tenantId: demo.id, sequence: 2, description: "Backfill SOP-version tags on the last 12 months of training records", owner: sureshKumar.name, ownerId: sureshKumar.id, dueDate: dPast(4), status: "in_progress", createdBy: priya.name, createdById: priya.id },
      { capaId: e1capa3.id, tenantId: demo.id, sequence: 3, description: "Add SOP-version field to the quarterly training audit checklist", owner: nisha.name, ownerId: nisha.id, dueDate: dFut(10), status: "pending", createdBy: priya.name, createdById: priya.id },
    ],
  });
  const ev3 = await initEvidence(e1capa3.id);
  await prisma.evidenceItem.update({ where: { id: ev3[1].id }, data: { status: "COMPLETE" } });
  // N/A items: write the rationale to BOTH the column AND an EvidenceNoteVersion
  // row, exactly as updateEvidenceStatus does, so seeded rationales surface in
  // the note-history UI (audit follow-up FIX 4). Idempotent: the parent FDA-483
  // CAPAs are wiped + recreated each seed run, cascading these rows away first.
  const naSeed: Array<[string, string]> = [
    [ev3[2].id, "No equipment logs relate to a training-record linkage CAPA."],
    [ev3[4].id, "Deviation history is not relevant to this LMS configuration fix."],
  ];
  for (const [evidenceItemId, reason] of naSeed) {
    await prisma.evidenceItem.update({ where: { id: evidenceItemId }, data: { status: "NOT_APPLICABLE", naReason: reason } });
    await prisma.evidenceNoteVersion.create({
      data: { evidenceItemId, notes: reason, statusAtTime: "NOT_APPLICABLE", createdBy: priya.name },
    });
  }
  await prisma.cAPAEffectivenessCriterion.create({
    data: { capaId: e1capa3.id, tenantId: demo.id, description: "100% of training records carry the correct SOP version for 90 days", targetMetric: "SOP-version tagged training records", measurementMethod: "LMS audit export", targetValue: "100%", monitoringPeriod: "90 days", createdBy: priya.name },
  });

  // ── Fixture 3: e1capa1 — CLOSED with a 90-day effectiveness check now DUE.
  await prisma.cAPA.update({
    where: { id: e1capa1.id },
    data: { status: "closed", closedBy: priya.name, closedAt: dPast(95), effectivenessCheck: true, effectivenessDate: dPast(5), effectivenessVerdict: null },
  });

  console.log("  Phase 6 fixtures: e1capa2 ready/pending_qa_review, e1capa3 rework, e1capa1 closed+effectiveness-due");

  /* ── EVENT 4 — Fresh / minimal (empty-state demo) ── */
  const e4InspStart = new Date(today); e4InspStart.setDate(e4InspStart.getDate() - 2); // 29 May
  const e4InspEnd = new Date(today); e4InspEnd.setDate(e4InspEnd.getDate() - 1); // 30 May
  const e4Deadline = addWorkingDays(today, 15);
  const e4 = await prisma.fDA483Event.create({
    data: {
      tenantId: demo.id,
      referenceNumber: "483-CHN-2026-003",
      eventType: "FDA 483",
      agency: "FDA",
      siteId: bangalore.id,
      inspectionDate: e4InspStart,
      inspectionEndDate: e4InspEnd,
      leadInvestigator: "Dr. Robert Chen",
      internalOwnerId: anita.id,
      responseDeadline: e4Deadline,
      status: "Open",
      createdBy: priya.name,
      createdAt: new Date(today),
    },
  });
  audit("FDA483_EVENT_REGISTERED", e4.id, "2026-05-31", { recordTitle: "483-CHN-2026-003" });

  // Insert all FDA 483 audit rows.
  await prisma.auditLog.createMany({ data: auditRows });

  // ── Verify ──
  const [evCount, obsCount, capaCount, commitCount, docCount, fdaAudit] =
    await Promise.all([
      prisma.fDA483Event.count(),
      prisma.fDA483Observation.count(),
      prisma.cAPA.count({ where: { source: "FDA 483" } }),
      prisma.fDA483Commitment.count(),
      prisma.fDA483Document.count(),
      prisma.auditLog.count({ where: { module: "FDA 483" } }),
    ]);
  console.log("  FDA 483 seeded:", {
    events: evCount,
    observations: obsCount,
    fda483Capas: capaCount,
    commitments: commitCount,
    responseDocuments: docCount,
    auditEntries: fdaAudit,
  });
  console.table(
    [
      { Reference: "483-CHN-2026-001", Status: "Response Submitted", Obs: 3, CAPAs: 3, Submitted: "Yes" },
      { Reference: "483-MUM-2026-002", Status: "Under Investigation", Obs: 4, CAPAs: 2, Submitted: "No" },
      { Reference: "WL-MUM-2026-001", Status: "Under Investigation", Obs: 2, CAPAs: 2, Submitted: "No" },
      { Reference: "483-CHN-2026-003", Status: "Open", Obs: 0, CAPAs: 0, Submitted: "No" },
    ],
  );

  /* ═══════════════════════════════════════════════════════════════
   * DEVIATIONS — wipe + reseed 5 lifecycle-stage scenarios (Tier 2:
   * investigation + CAPA decision + SoD). Reporters are distributed
   * across users so any single test login can investigate some of them.
   *
   * Field mapping vs the task spec (only post-Tier 2 fields exist):
   *   detectedById → detectedBy (name) + createdById (authoritative
   *     reporter FK used by SoD); ownerId → owner (userId); detectedAt →
   *     detectedDate; *Risk → *Impact (lowercase enum); status/type →
   *     lowercase canonical; rcaMethod "5 Why" → "5Why" etc.
   *   dataIntegrityImpact → DROPPED (no such column on Deviation).
   * Site note: the task referenced DEV-CHN-* at "Bangalore R&D Centre",
   *   but CHN is Chennai QC Laboratory's code (Bangalore = BLR). Kept the
   *   task's literal DEV-CHN references and seeded them at Chennai so the
   *   reference codes stay canonical.
   * ═══════════════════════════════════════════════════════════════ */
  const vikram = byUser("vikram.singh"); // it_cdo — deviation owner/investigator

  const dAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };
  const dAhead = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };

  // ── Wipe (scoped to Deviation + its derivative CAPAs only) ──
  // AuditLog module value matches what the Tier 2 actions write:
  // "Deviation Management" (not "DEVIATION").
  const devWipe = await prisma.$transaction([
    prisma.auditLog.deleteMany({ where: { module: "Deviation Management" } }),
    prisma.cAPA.deleteMany({ where: { source: "Deviation" } }),
    prisma.deviation.deleteMany({}),
  ]);
  console.log("  Deviations wiped:", { audit: devWipe[0].count, deviationCapas: devWipe[1].count, deviations: devWipe[2].count });

  // RCA serialization — mirrors DeviationInvestigation.tsx buildPayload so
  // the saved-RCA display renders the structured blocks.
  const FB_CATS = ["People", "Process", "Equipment", "Materials", "Environment", "Management"] as const;
  const synth5Why = (whys: string[]) => whys.filter((w) => w.trim()).map((w, i) => `Why ${i + 1}: ${w}`).join("\n");
  const synthFishbone = (cats: Record<string, string>, root: string) =>
    FB_CATS.filter((c) => cats[c]?.trim()).map((c) => `${c}: ${cats[c]}`).join("\n") + `\n\nRoot cause: ${root}`;

  // ── DEV 1 — just reported, no investigation (reporter: Anita) ──
  const dev1 = await prisma.deviation.create({ data: {
    tenantId: demo.id, reference: "DEV-CHN-2026-001", siteId: chennai.id,
    title: "Tablet hardness OOS — Batch B-2026-018",
    description: "Tablet hardness measurements exceeded the upper specification limit (12 kP vs SOP limit of 10 kP). 5 of 20 tested tablets above limit.",
    type: "unplanned", category: "Out Of Specification", severity: "Major", area: "Manufacturing",
    detectedBy: anita.name, detectedDate: dAgo(2), createdBy: anita.name, createdById: anita.id,
    owner: vikram.id, dueDate: dAhead(10), status: "open",
    immediateAction: "Batch quarantined. QC investigation initiated. No release pending review.",
    patientSafetyImpact: "medium", productQualityImpact: "high", regulatoryImpact: "medium",
  } });

  // ── DEV 2 — investigation in progress (5 Why, first 3 filled) ──
  const dev2whys = [
    "Settle plate counts in Cleanroom B exceeded the action level during the monitoring session.",
    "Airborne particulate was not being cleared at the qualified rate.",
    "The HVAC supplying Cleanroom B was not maintaining the designed air-change rate.",
    "", "",
  ];
  const dev2 = await prisma.deviation.create({ data: {
    tenantId: demo.id, reference: "DEV-CHN-2026-002", siteId: chennai.id,
    title: "Environmental monitoring exceeded action level — Cleanroom B",
    description: "Settle plate count 65 CFU/4hr vs action limit 50 CFU/4hr. Personnel monitoring also elevated. Possible HVAC malfunction.",
    type: "unplanned", category: "EM Excursion", severity: "Major", area: "Manufacturing",
    detectedBy: rahul.name, detectedDate: dAgo(3), createdBy: rahul.name, createdById: rahul.id,
    owner: nisha.id, dueDate: dAhead(7), status: "under_investigation",
    immediateAction: "Cleanroom temporarily restricted. HVAC engineering called for investigation.",
    patientSafetyImpact: "low", productQualityImpact: "medium", regulatoryImpact: "low",
    rcaMethod: "5Why", rcaData: JSON.stringify({ whys: dev2whys }), rootCause: null,
  } });

  // ── DEV 3 — investigation complete (Fishbone), CAPA decision pending ──
  const dev3cats: Record<string, string> = {
    People: "The equipment owner tracked PQ due-dates personally, with no cover during leave.",
    Process: "PQ scheduling was a manual spreadsheet not integrated with the equipment master.",
    Equipment: "HPLC #4 carried no system-enforced qualification-due flag.",
    Materials: "No material factor identified.",
    Environment: "A heavy stability-testing workload kept the instrument in continuous use.",
    Management: "The qualification due-list was not reviewed at the periodic quality review.",
  };
  const dev3root = "Calibration scheduling system did not flag the overdue PQ due to manual tracking process not integrated with equipment master data.";
  const dev3 = await prisma.deviation.create({ data: {
    tenantId: demo.id, reference: "DEV-CHN-2026-003", siteId: chennai.id,
    title: "Equipment qualification overdue — HPLC #4",
    description: "PQ requalification scheduled 2026-04-15 was not completed. System has been used for stability testing in the interim period.",
    type: "unplanned", category: "Qualification Overdue", severity: "Major", area: "QC Lab",
    detectedBy: anita.name, detectedDate: dAgo(5), createdBy: anita.name, createdById: anita.id,
    owner: vikram.id, dueDate: dAhead(5), status: "under_investigation",
    immediateAction: "HPLC #4 taken out of routine use. Pending data integrity review.",
    patientSafetyImpact: "medium", productQualityImpact: "high", regulatoryImpact: "high",
    rcaMethod: "Fishbone", rcaData: JSON.stringify({ categories: dev3cats, root: dev3root }),
    rootCause: synthFishbone(dev3cats, dev3root),
    investigationCompletedAt: dAgo(1), investigationCompletedById: vikram.id,
  } });

  // ── DEV 4 — CAPA required + raised (Critical, Mumbai) ──
  const dev4whys = [
    "The pre-filter seal on the line-3 filter housing failed during a humidity spike.",
    "The seal had degraded faster than its qualified service interval assumed.",
    "The qualification interval did not account for humidity-driven elastomer ageing.",
    "The qualification procedure used a single fixed interval regardless of environmental zone.",
    "Filter housing seal qualification interval was set too long for the humidity-exposed environment; procedure did not specify humidity-dependent intervals.",
  ];
  const dev4 = await prisma.deviation.create({ data: {
    tenantId: demo.id, reference: "DEV-MUM-2026-001", siteId: mumbai.id,
    title: "Critical: Filter housing seal failure during fill operation",
    description: "Filter housing pre-filter seal failed during humidity spike on line 3. Production halted immediately.",
    type: "unplanned", category: "Process", severity: "Critical", area: "Sterile Manufacturing",
    detectedBy: nisha.name, detectedDate: dAgo(14), createdBy: nisha.name, createdById: nisha.id,
    owner: anita.id, dueDate: dAhead(2), status: "under_investigation",
    immediateAction: "Line 3 stopped immediately. Affected batches quarantined. Engineering and Production heads notified.",
    patientSafetyImpact: "high", productQualityImpact: "high", regulatoryImpact: "medium",
    rcaMethod: "5Why", rcaData: JSON.stringify({ whys: dev4whys }), rootCause: synth5Why(dev4whys),
    investigationCompletedAt: dAgo(7), investigationCompletedById: anita.id,
    capaDecisionMade: true, capaDecisionRequired: true,
    capaDecisionReason: "Root cause indicates systemic qualification scheduling gap. CAPA required to revise SOP and retrain QC staff on humidity-zone equipment.",
    capaDecisionAt: dAgo(5), capaDecisionById: priya.id,
  } });
  // Linked CAPA. NOTE: CAPA-MUM-2026-001..004 are already taken by the FDA 483
  // seed and CAPA.reference is @unique — so the deviation CAPA uses the next
  // free MUM number (005) rather than the spec's 001.
  const dev4capa = await prisma.cAPA.create({ data: {
    tenantId: demo.id, reference: "CAPA-MUM-2026-005", title: "Filter housing seal qualification interval revision", source: "Deviation", siteId: mumbai.id,
    description: "Address: Filter housing seal qualification interval revision (from DEV-MUM-2026-001).",
    risk: "High", owner: anita.id, dueDate: dAhead(30), status: "in_progress",
    rca: dev4whys[4], rcaMethod: "5 Why", deviationId: dev4.id,
    createdBy: priya.name, createdAt: dAgo(5),
  } });
  await prisma.deviation.update({ where: { id: dev4.id }, data: { linkedCAPAId: dev4capa.id } });

  // ── DEV 5 — closed without CAPA (one-off, Barrier Analysis) ──
  const dev5root = "Reviewer training did not emphasize standardized formatting. Isolated to one reviewer. Not a systemic issue.";
  const dev5 = await prisma.deviation.create({ data: {
    tenantId: demo.id, reference: "DEV-CHN-2026-004", siteId: chennai.id,
    title: "Documentation: Batch record review signature formatting",
    description: "Batch record review signature dates not consistently formatted across the manufacturing record. Minor formatting variations only.",
    type: "unplanned", category: "Documentation", severity: "Minor", area: "QC Lab",
    detectedBy: vikram.name, detectedDate: dAgo(20), createdBy: vikram.name, createdById: vikram.id,
    owner: rahul.id, dueDate: dAgo(15), status: "closed",
    immediateAction: "Reviewer asked to use consistent format going forward.",
    patientSafetyImpact: "none", productQualityImpact: "none", regulatoryImpact: "low",
    rcaMethod: "BarrierAnalysis", rcaData: JSON.stringify({ freeform: dev5root }), rootCause: dev5root,
    investigationCompletedAt: dAgo(14), investigationCompletedById: rahul.id,
    capaDecisionMade: true, capaDecisionRequired: false,
    capaDecisionReason: "Isolated formatting issue, no regulatory impact. Reviewer has been informed. No CAPA needed. Closing without action.",
    capaDecisionAt: dAgo(12), capaDecisionById: priya.id,
    closedBy: priya.name, closedDate: dAgo(11),
    closureNotes: "Closed — no CAPA required per QA decision (isolated formatting issue).",
  } });

  // ── Audit trail (module "Deviation Management") ──
  const devAuditRow = (
    action: string,
    recordId: string,
    daysAgo: number,
    u: { id: string; name: string; role: string },
    extra: Partial<Prisma.AuditLogCreateManyInput> = {},
  ): Prisma.AuditLogCreateManyInput => ({
    tenantId: demo.id, userId: u.id, userName: u.name, userRole: u.role,
    module: "Deviation Management", action, recordId, createdAt: dAgo(daysAgo), ...extra,
  });
  const devAuditRows: Prisma.AuditLogCreateManyInput[] = [
    devAuditRow("DEVIATION_REPORTED", dev1.id, 2, anita),
    devAuditRow("DEVIATION_REPORTED", dev2.id, 3, rahul),
    devAuditRow("DEVIATION_INVESTIGATION_SAVED", dev2.id, 2, nisha, { newValue: JSON.stringify({ rcaMethod: "5Why" }) }),
    devAuditRow("DEVIATION_REPORTED", dev3.id, 5, anita),
    devAuditRow("DEVIATION_INVESTIGATION_SAVED", dev3.id, 2, vikram, { newValue: JSON.stringify({ rcaMethod: "Fishbone" }) }),
    devAuditRow("DEVIATION_INVESTIGATION_COMPLETED", dev3.id, 1, vikram, { newValue: JSON.stringify({ rcaMethod: "Fishbone", completedBy: vikram.name }) }),
    devAuditRow("DEVIATION_REPORTED", dev4.id, 14, nisha),
    devAuditRow("DEVIATION_INVESTIGATION_SAVED", dev4.id, 9, anita, { newValue: JSON.stringify({ rcaMethod: "5Why" }) }),
    devAuditRow("DEVIATION_INVESTIGATION_COMPLETED", dev4.id, 7, anita, { newValue: JSON.stringify({ rcaMethod: "5Why", completedBy: anita.name }) }),
    devAuditRow("DEVIATION_CAPA_DECISION_MADE", dev4.id, 5, priya, { newValue: JSON.stringify({ capaRequired: true }) }),
    devAuditRow("DEVIATION_CAPA_RAISED", dev4.id, 5, priya, { recordTitle: "CAPA-MUM-2026-005", newValue: dev4capa.id }),
    devAuditRow("DEVIATION_REPORTED", dev5.id, 20, vikram),
    devAuditRow("DEVIATION_INVESTIGATION_SAVED", dev5.id, 16, rahul, { newValue: JSON.stringify({ rcaMethod: "BarrierAnalysis" }) }),
    devAuditRow("DEVIATION_INVESTIGATION_COMPLETED", dev5.id, 14, rahul, { newValue: JSON.stringify({ rcaMethod: "BarrierAnalysis", completedBy: rahul.name }) }),
    devAuditRow("DEVIATION_CAPA_DECISION_MADE", dev5.id, 12, priya, { newValue: JSON.stringify({ capaRequired: false }) }),
    devAuditRow("DEVIATION_CLOSED", dev5.id, 11, priya),
  ];
  await prisma.auditLog.createMany({ data: devAuditRows });

  // ── Verify ──
  const [devCount, devCapaCount, devAuditCount] = await Promise.all([
    prisma.deviation.count(),
    prisma.cAPA.count({ where: { source: "Deviation" } }),
    prisma.auditLog.count({ where: { module: "Deviation Management" } }),
  ]);
  console.log("  Deviations seeded:", { deviations: devCount, deviationCapas: devCapaCount, auditEntries: devAuditCount });
  console.table([
    { Reference: "DEV-CHN-2026-001", Status: "open", Reporter: anita.name, Owner: vikram.name, Investigation: "Not started", CAPADecision: "Not made" },
    { Reference: "DEV-CHN-2026-002", Status: "under_investigation", Reporter: rahul.name, Owner: nisha.name, Investigation: "In progress", CAPADecision: "Not made" },
    { Reference: "DEV-CHN-2026-003", Status: "under_investigation", Reporter: anita.name, Owner: vikram.name, Investigation: "Completed", CAPADecision: "Pending" },
    { Reference: "DEV-MUM-2026-001", Status: "under_investigation", Reporter: nisha.name, Owner: anita.name, Investigation: "Completed", CAPADecision: "Required + raised" },
    { Reference: "DEV-CHN-2026-004", Status: "closed", Reporter: vikram.name, Owner: rahul.name, Investigation: "Completed", CAPADecision: "Not required" },
  ]);

  // ── Demo gap-assessment findings ──
  // Seeded with explicit site-scoped references (FND-{siteCode}-YYYY-NNN) so
  // they mirror the CAPA-/DEV- schemes and never fall back to the
  // "FND-LEGACY-<id>" display label. Upsert keyed on the stable id so
  // re-seeding an existing DB heals any null reference (matching the
  // password-heal pattern above), and a fresh db:reset recreates them.
  // New findings raised in-app continue the sequence from FND-BLR-2026-004
  // because generateReference() reads the max existing reference. Severities
  // use the app's Critical/High/Low vocabulary (CreateFindingSchema enum).
  const findings = [
    {
      id: "demo-find-001",
      reference: "FND-BLR-2026-001",
      requirement: "Temperature excursion in stability chamber — 25C ± 2C limit breached for 4hrs",
      area: "Manufacturing",
      framework: "21 CFR 211",
      severity: "High",
      status: "Open",
      owner: "Dr. Priya Sharma",
      targetDate: new Date("2026-05-27T14:16:16Z"),
      evidenceLink: null as string | null,
    },
    {
      id: "demo-find-002",
      reference: "FND-BLR-2026-002",
      requirement: "Missing operator signature on batch record BMR-2026-0143",
      area: "QC Lab",
      framework: "21 CFR 211",
      severity: "Low",
      status: "In Progress",
      owner: "Anita Patel",
      targetDate: new Date("2026-05-20T14:16:16Z"),
      evidenceLink: null as string | null,
    },
    {
      id: "demo-find-003",
      reference: "FND-BLR-2026-003",
      requirement: "Validation gap in HVAC monitoring — no continuous data integrity",
      area: "Utilities",
      framework: "EU GMP Annex 11",
      severity: "Critical",
      status: "Open",
      owner: "Vikram Singh",
      targetDate: new Date("2026-05-16T14:16:16Z"),
      evidenceLink: null as string | null,
    },
  ];
  for (const f of findings) {
    const evidenceLink = f.evidenceLink ?? null;
    await prisma.finding.upsert({
      where: { id: f.id },
      update: { reference: f.reference, evidenceLink },
      create: {
        id: f.id,
        reference: f.reference,
        tenantId: demo.id,
        siteId: bangalore.id,
        requirement: f.requirement,
        area: f.area,
        framework: f.framework,
        severity: f.severity,
        status: f.status,
        owner: f.owner,
        targetDate: f.targetDate,
        evidenceLink,
        createdBy: f.owner,
      },
    });
  }
  console.log("  Findings:", findings.length);

  // ── Regulatory regions (Item #3, parity-critical) ──
  // Seed the RegulatoryRegion lookup from the load-bearing REGULATORY_REGIONS
  // constant so the DB reproduces the EXACT 8 value strings that Tenant.
  // regulatoryRegion + FrameworkRegion.region already reference. Idempotent by
  // value; `update: {}` never clobbers an admin-edited label on re-seed.
  for (const r of REGULATORY_REGIONS) {
    await prisma.regulatoryRegion.upsert({
      where: { value: r.value },
      update: {},
      create: { value: r.value, label: r.label },
    });
  }
  // Reserved GLOBAL region (Stage 1). A REAL, protected RegulatoryRegion row —
  // not just the Framework.appliesToAllRegions flag — so GLOBAL can be the
  // archive → reassignment target and appear in region dropdowns. Idempotent by
  // value; `update: {}` never clobbers the label on re-seed. PARITY: this row
  // adds no FrameworkRegion links, so no tenant's effective framework set moves.
  await prisma.regulatoryRegion.upsert({
    where: { value: GLOBAL_REGION_VALUE },
    update: {},
    create: { value: GLOBAL_REGION_VALUE, label: GLOBAL_REGION_LABEL },
  });
  console.log("  Regulatory regions:", REGULATORY_REGIONS.length + 1, "(incl. reserved GLOBAL)");

  // ── Frameworks catalog + per-tenant enablement (Phase 1, parity-critical) ──
  // Seed the 9 reserved frameworks as GLOBAL (appliesToAllRegions) + platform-
  // enabled, then enable all 9 for every existing customer tenant. This exactly
  // reproduces today's "all frameworks enabled" default so the Gap dropdown is
  // unchanged. Idempotent: upsert by key and by (tenantId, frameworkId), and the
  // tenant upsert `update:{}` never clobbers a later admin toggle on re-seed.
  const frameworkRows = await Promise.all(
    RESERVED_FRAMEWORKS.map((f, i) =>
      prisma.framework.upsert({
        where: { key: f.key },
        update: { name: f.name, description: f.description },
        create: {
          key: f.key,
          name: f.name,
          description: f.description,
          platformEnabled: true,
          appliesToAllRegions: true,
          sortOrder: i + 1, // stable display order (Item #5) — no all-0 ties
        },
      }),
    ),
  );
  const customerTenants = await prisma.tenant.findMany({
    where: { role: { not: "super_admin" } }, // platform admin doesn't raise gaps
    select: { id: true },
  });
  for (const t of customerTenants) {
    for (const fw of frameworkRows) {
      await prisma.tenantFramework.upsert({
        where: { tenantId_frameworkId: { tenantId: t.id, frameworkId: fw.id } },
        update: {}, // preserve any explicit admin enable/disable on re-seed
        create: { tenantId: t.id, frameworkId: fw.id, enabled: true },
      });
    }
  }
  console.log("  Frameworks:", frameworkRows.length, "catalog; enabled for", customerTenants.length, "tenants");

  // Per-plan role-cap DEFAULTS (idempotent — fills missing rows, never clobbers
  // an admin-edited cap). Kills the ∞ display on standard plans.
  const rl = await seedPlanRoleLimits(prisma);
  console.log("  Plan role limits:", `${rl.created} created, ${rl.updated} updated, ${rl.keptEdited} kept across ${rl.plans} plans`);

  console.log("Seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
