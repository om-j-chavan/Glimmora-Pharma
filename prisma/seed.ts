import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // ── Super Admin tenant ──
  const superAdmin = await prisma.tenant.upsert({
    where: { email: "superadmin@glimmora.com" },
    update: {},
    create: {
      customerCode: "SUPER_001",
      name: "Glimmora Platform",
      username: "superadmin",
      email: "superadmin@glimmora.com",
      passwordHash: await bcrypt.hash("1", 10),
      role: "super_admin",
      isActive: true,
    },
  });
  console.log("  Super admin:", superAdmin.id);

  // ── Demo customer tenant ──
  const demo = await prisma.tenant.upsert({
    where: { email: "admin@pharmaglimmora.com" },
    update: {},
    create: {
      customerCode: "PGI_001",
      name: "Pharma Glimmora International",
      username: "admin",
      email: "admin@pharmaglimmora.com",
      passwordHash: await bcrypt.hash("Admin@123", 10),
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
  const chennai = await prisma.site.create({
    data: { tenantId: demo.id, name: "Chennai QC Laboratory", location: "Chennai, Tamil Nadu", gmpScope: "QC Testing", risk: "HIGH" },
  });
  const mumbai = await prisma.site.create({
    data: { tenantId: demo.id, name: "Mumbai API Plant", location: "Mumbai, Maharashtra", gmpScope: "API Manufacturing", risk: "MEDIUM" },
  });
  const bangalore = await prisma.site.create({
    data: { tenantId: demo.id, name: "Bangalore R&D Centre", location: "Bangalore, Karnataka", gmpScope: "R&D", risk: "MEDIUM" },
  });
  const hyderabad = await prisma.site.create({
    data: { tenantId: demo.id, name: "Hyderabad Formulation", location: "Hyderabad, Telangana", gmpScope: "Formulation", risk: "HIGH" },
  });
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
  for (const u of users) {
    await prisma.user.create({
      data: { tenantId: demo.id, ...u, passwordHash: await bcrypt.hash("Demo@123", 10) },
    });
  }
  console.log("  Users:", users.length);

  console.log("Seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
