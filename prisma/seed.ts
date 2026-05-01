import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Refresh passwordHash on every seed run so re-seeding heals hash drift
  // (manual edits, partial migrations, stale rows from earlier seed values).
  // Without this the upsert update branch was a no-op and login could
  // silently break with no way to recover short of `db:reset`.
  const superAdminHash = await bcrypt.hash("1", 10);
  const demoHash = await bcrypt.hash("Admin@123", 10);

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

  // ── Subscription ──
  await prisma.subscription.upsert({
    where: { tenantId: demo.id },
    update: {},
    create: {
      tenantId: demo.id,
      maxAccounts: 15,
      startDate: new Date("2026-01-01"),
      expiryDate: new Date("2026-12-31"),
      status: "Active",
    },
  });

  // ── Sites ──
  // Upsert keyed on (tenantId, name) so re-seeding doesn't duplicate rows.
  // Previously used `create`, which is why earlier reseeds left 12 site rows
  // (4 unique × 3) instead of 4.
  const sitesData = [
    { name: "Chennai QC Laboratory", location: "Chennai, Tamil Nadu", gmpScope: "QC Testing", risk: "HIGH" },
    { name: "Mumbai API Plant", location: "Mumbai, Maharashtra", gmpScope: "API Manufacturing", risk: "MEDIUM" },
    { name: "Bangalore R&D Centre", location: "Bangalore, Karnataka", gmpScope: "R&D", risk: "MEDIUM" },
    { name: "Hyderabad Formulation", location: "Hyderabad, Telangana", gmpScope: "Formulation", risk: "HIGH" },
  ] as const;
  const upsertedSites = await Promise.all(
    sitesData.map((s) =>
      prisma.site.upsert({
        where: { tenantId_name: { tenantId: demo.id, name: s.name } },
        update: { location: s.location, gmpScope: s.gmpScope, risk: s.risk, isActive: true },
        create: { tenantId: demo.id, name: s.name, location: s.location, gmpScope: s.gmpScope, risk: s.risk },
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
  ];
  // Hash once — bcrypt generates a fresh random salt per call, so calling it
  // inside the loop wasted CPU and made re-runs slower than necessary.
  const userPasswordHash = await bcrypt.hash("Demo@123", 10);
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

  console.log("Seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
