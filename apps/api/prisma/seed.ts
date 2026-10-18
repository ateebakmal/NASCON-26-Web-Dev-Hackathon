import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { MANAGER_PRESET, SALES_REP_PRESET, ADMIN_PRESET } from "@ubp/shared";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.workspace.findFirst({ where: { name: "Acme Solar" } });
  if (existing) {
    console.log("Seed data already present (workspace 'Acme Solar' exists) -- skipping.");
    return;
  }

  const workspace = await prisma.workspace.create({ data: { name: "Acme Solar" } });

  const ownerSet = await prisma.permissionSet.create({
    data: { workspaceId: workspace.id, name: "Owner (full access)", isSystem: true },
  });
  const adminSet = await prisma.permissionSet.create({
    data: {
      workspaceId: workspace.id,
      name: "Administrator",
      permissions: { create: ADMIN_PRESET.map((p) => ({ resource: p.resource, action: p.action })) },
    },
  });
  const managerSet = await prisma.permissionSet.create({
    data: {
      workspaceId: workspace.id,
      name: "Manager",
      permissions: { create: MANAGER_PRESET.map((p) => ({ resource: p.resource, action: p.action })) },
    },
  });
  const salesRepSet = await prisma.permissionSet.create({
    data: {
      workspaceId: workspace.id,
      name: "Sales Rep",
      permissions: { create: SALES_REP_PRESET.map((p) => ({ resource: p.resource, action: p.action })) },
    },
  });

  const password = await argon2.hash("password123", { type: argon2.argon2id });

  const owner = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      name: "Olivia Owner",
      email: "owner@acmesolar.test",
      passwordHash: password,
      baseRole: "OWNER",
      permissionSetId: ownerSet.id,
      // maxOpenLeads: 0 keeps the Owner out of the general round-robin pool
      // (they're still reachable via the explicit chain-exhaustion fallback
      // to Owner, a separate code path) -- otherwise, with everyone tied at
      // "never assigned", a stable sort would draw the Owner first.
      employeeStatus: { create: { workspaceId: workspace.id, availability: "AVAILABLE", maxOpenLeads: 0 } },
    },
  });

  const admin = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      name: "Amara Admin",
      email: "admin@acmesolar.test",
      passwordHash: password,
      baseRole: "ADMIN",
      permissionSetId: adminSet.id,
      employeeStatus: { create: { workspaceId: workspace.id, availability: "AVAILABLE", maxOpenLeads: 0 } },
    },
  });

  const manager = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      name: "Marcus Manager",
      email: "manager@acmesolar.test",
      passwordHash: password,
      baseRole: "USER",
      permissionSetId: managerSet.id,
      employeeStatus: { create: { workspaceId: workspace.id, availability: "AVAILABLE", maxOpenLeads: 0 } },
    },
  });

  const rep1 = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      name: "Sam Sales",
      email: "sam@acmesolar.test",
      passwordHash: password,
      baseRole: "USER",
      permissionSetId: salesRepSet.id,
      employeeStatus: { create: { workspaceId: workspace.id, availability: "AVAILABLE", maxOpenLeads: 5 } },
    },
  });

  const rep2 = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      name: "Priya Pitch",
      email: "priya@acmesolar.test",
      passwordHash: password,
      baseRole: "USER",
      permissionSetId: salesRepSet.id,
      employeeStatus: { create: { workspaceId: workspace.id, availability: "OFFLINE", maxOpenLeads: 5 } },
    },
  });

  // Dev-mode assignment rule: short windows so escalation is observable in
  // seconds during a live demo (see ESCALATION_MIN_WINDOW_SECONDS in .env).
  await prisma.assignmentRule.create({
    data: {
      workspaceId: workspace.id,
      ackWindowSeconds: 20,
      idleThresholdSeconds: 120,
      escalationLevels: [
        { type: "next_eligible", timeoutSeconds: 20 },
        { type: "backup", userId: manager.id, timeoutSeconds: 20 },
        { type: "manager", userId: owner.id, timeoutSeconds: 30 },
      ],
    },
  });

  console.log("Seeded workspace 'Acme Solar' with demo users (password: password123):");
  console.log(`  Owner:   ${owner.email}`);
  console.log(`  Admin:   ${admin.email}`);
  console.log(`  Manager: ${manager.email} (permission set: Manager)`);
  console.log(`  Rep 1:   ${rep1.email} (Available)`);
  console.log(`  Rep 2:   ${rep2.email} (Offline)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
