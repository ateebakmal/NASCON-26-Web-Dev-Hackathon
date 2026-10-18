import { PrismaClient, Prisma } from "@prisma/client";
import * as argon2 from "argon2";
import { MANAGER_PRESET, SALES_REP_PRESET, ADMIN_PRESET } from "@ubp/shared";

const prisma = new PrismaClient();

const WORKSPACE_NAME = "SunPeak Solar";

async function main() {
  const existing = await prisma.workspace.findFirst({ where: { name: WORKSPACE_NAME } });
  if (existing) {
    console.log(`Seed data already present (workspace '${WORKSPACE_NAME}') -- skipping.`);
    return;
  }

  const workspace = await prisma.workspace.create({ data: { name: WORKSPACE_NAME } });

  // --- permission sets -------------------------------------------------------
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
      permissions: {
        create: [...MANAGER_PRESET, { resource: "contacts", action: "view" }, { resource: "companies", action: "view" }, { resource: "opportunities", action: "view" }, { resource: "opportunities", action: "edit" }].map(
          (p) => ({ resource: p.resource, action: p.action })
        ),
      },
    },
  });
  const salesRepSet = await prisma.permissionSet.create({
    data: {
      workspaceId: workspace.id,
      name: "Sales Rep",
      // Deliberately WITHOUT "opportunities:export" and with a fieldMask on
      // deal values, so the masking demo has a user to show it with (F1.4).
      permissions: {
        create: [
          ...SALES_REP_PRESET.map((p) => ({ resource: p.resource, action: p.action, fieldMask: [] as string[] })),
          { resource: "contacts", action: "view", fieldMask: [] },
          { resource: "contacts", action: "create", fieldMask: [] },
          { resource: "companies", action: "view", fieldMask: [] },
          // Deal values -- and the value-based dashboard figures derived from
          // them -- are masked for this role (F1.4).
          { resource: "opportunities", action: "view", fieldMask: ["value", "openPipelineValue", "collectedThisMonth"] },
          { resource: "opportunities", action: "edit", fieldMask: ["value"] },
          { resource: "opportunities", action: "create", fieldMask: [] },
        ],
      },
    },
  });

  // --- users -----------------------------------------------------------------
  const password = await argon2.hash("password123", { type: argon2.argon2id });

  const owner = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      name: "Owais Khan",
      email: "owner@sunpeak.test",
      passwordHash: password,
      baseRole: "OWNER",
      permissionSetId: ownerSet.id,
      // maxOpenLeads 0 keeps the Owner out of the general round-robin pool;
      // they stay reachable as the explicit chain-exhaustion backstop.
      employeeStatus: { create: { workspaceId: workspace.id, availability: "AVAILABLE", maxOpenLeads: 0 } },
    },
  });

  const admin = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      name: "Amara Admin",
      email: "admin@sunpeak.test",
      passwordHash: password,
      baseRole: "ADMIN",
      permissionSetId: adminSet.id,
      employeeStatus: { create: { workspaceId: workspace.id, availability: "AVAILABLE", maxOpenLeads: 0 } },
    },
  });

  const manager = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      name: "Hina Malik",
      email: "manager@sunpeak.test",
      passwordHash: password,
      baseRole: "USER",
      permissionSetId: managerSet.id,
      employeeStatus: { create: { workspaceId: workspace.id, availability: "AVAILABLE", maxOpenLeads: 0 } },
    },
  });

  const bilal = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      name: "Bilal Ahmed",
      email: "bilal@sunpeak.test",
      passwordHash: password,
      baseRole: "USER",
      permissionSetId: salesRepSet.id,
      employeeStatus: { create: { workspaceId: workspace.id, availability: "AVAILABLE", maxOpenLeads: 8 } },
    },
  });

  const sara = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      name: "Sara Iqbal",
      email: "sara@sunpeak.test",
      passwordHash: password,
      baseRole: "USER",
      permissionSetId: salesRepSet.id,
      employeeStatus: { create: { workspaceId: workspace.id, availability: "AVAILABLE", maxOpenLeads: 8 } },
    },
  });

  const omar = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      name: "Omar Sheikh",
      email: "omar@sunpeak.test",
      passwordHash: password,
      baseRole: "USER",
      permissionSetId: salesRepSet.id,
      employeeStatus: { create: { workspaceId: workspace.id, availability: "OFFLINE", maxOpenLeads: 8 } },
    },
  });

  const reps = [bilal, sara];

  // --- assignment rule (dev-mode windows so escalation is demoable live) ------
  await prisma.assignmentRule.create({
    data: {
      workspaceId: workspace.id,
      ackWindowSeconds: 30,
      idleThresholdSeconds: 300,
      escalationLevels: [
        { type: "next_eligible", timeoutSeconds: 30 },
        { type: "backup", userId: manager.id, timeoutSeconds: 30 },
        { type: "manager", userId: owner.id, timeoutSeconds: 60 },
      ],
    },
  });

  // --- pipelines and stages --------------------------------------------------
  const residential = await prisma.pipeline.create({
    data: { workspaceId: workspace.id, name: "Residential Solar", isDefault: true, position: 0 },
  });
  const commercial = await prisma.pipeline.create({
    data: { workspaceId: workspace.id, name: "Commercial Solar", position: 1 },
  });

  const resStages = await Promise.all(
    [
      { name: "Leads", position: 0, type: "OPEN" as const, color: "slate" },
      { name: "Site Survey", position: 1, type: "OPEN" as const, color: "blue" },
      { name: "Proposal", position: 2, type: "OPEN" as const, color: "amber" },
      { name: "Won", position: 3, type: "WON" as const, color: "emerald" },
      { name: "Lost", position: 4, type: "LOST" as const, color: "rose" },
    ].map((s) => prisma.stage.create({ data: { ...s, pipelineId: residential.id } }))
  );

  await Promise.all(
    [
      { name: "Discovery", position: 0, type: "OPEN" as const, color: "slate" },
      { name: "Technical Review", position: 1, type: "OPEN" as const, color: "blue" },
      { name: "Contract", position: 2, type: "OPEN" as const, color: "amber" },
      { name: "Won", position: 3, type: "WON" as const, color: "emerald" },
      { name: "Lost", position: 4, type: "LOST" as const, color: "rose" },
    ].map((s) => prisma.stage.create({ data: { ...s, pipelineId: commercial.id } }))
  );

  // --- custom fields ---------------------------------------------------------
  // "Roof type" + "System size" are required to enter Proposal -- this is the
  // guardrail the board demo shows (F2.4).
  await prisma.customFieldDefinition.create({
    data: {
      workspaceId: workspace.id,
      recordType: "DEAL",
      pipelineId: residential.id,
      key: "roof_type",
      label: "Roof type",
      type: "DROPDOWN",
      options: ["Concrete", "Metal sheet", "Tile", "Flat"],
      position: 0,
    },
  });
  await prisma.customFieldDefinition.create({
    data: {
      workspaceId: workspace.id,
      recordType: "DEAL",
      pipelineId: residential.id,
      key: "system_size_kw",
      label: "System size (kW)",
      type: "NUMBER",
      position: 1,
    },
  });
  await prisma.customFieldDefinition.create({
    data: {
      workspaceId: workspace.id,
      recordType: "DEAL",
      pipelineId: commercial.id,
      key: "site_count",
      label: "Number of sites",
      type: "NUMBER",
      position: 0,
    },
  });
  await prisma.customFieldDefinition.create({
    data: {
      workspaceId: workspace.id,
      recordType: "CONTACT",
      key: "preferred_language",
      label: "Preferred language",
      type: "DROPDOWN",
      options: ["Urdu", "English", "Punjabi"],
      position: 0,
    },
  });

  const proposalStage = resStages.find((s) => s.name === "Proposal")!;
  await prisma.stage.update({
    where: { id: proposalStage.id },
    data: { requiredFieldKeys: ["roof_type", "system_size_kw"] },
  });

  // --- companies and contacts ------------------------------------------------
  const companySpecs = [
    { name: "Gulberg Residency", domain: "gulbergresidency.pk" },
    { name: "Chase Textiles", domain: "chasetextiles.com" },
    { name: "Canva Pakistan", domain: "canva.pk" },
    { name: "Alfa Bank", domain: "alfabank.pk" },
    { name: "Flicker Media", domain: "flickermedia.pk" },
    { name: "Badoo Logistics", domain: "badoologistics.com" },
    { name: "Discord Cafe", domain: "discordcafe.pk" },
    { name: "IBM Lahore", domain: "ibm.com" },
    { name: "Procreate Studios", domain: "procreatestudios.pk" },
    { name: "Unity Developers", domain: "unitydev.pk" },
  ];
  const companies = await Promise.all(
    companySpecs.map((c) => prisma.company.create({ data: { ...c, workspaceId: workspace.id } }))
  );

  const contactSpecs = [
    { name: "Ayesha Siddiqui", phone: "+923001234567", email: "ayesha@gulbergresidency.pk", company: 0 },
    { name: "Ryan Chaudhry", phone: "+923011234567", email: "ryan@chasetextiles.com", company: 1 },
    { name: "Dylan Masood", phone: "+923021234567", email: "dylan@canva.pk", company: 2 },
    { name: "Fatima Noor", phone: "+923031234567", email: "fatima@alfabank.pk", company: 3 },
    { name: "Hassan Raza", phone: "+923041234567", email: "hassan@flickermedia.pk", company: 4 },
    { name: "Zain Abbas", phone: "+923051234567", email: "zain@badoologistics.com", company: 5 },
    { name: "Mariam Tariq", phone: "+923061234567", email: "mariam@discordcafe.pk", company: 6 },
    { name: "Usman Ali", phone: "+923071234567", email: "usman@ibm.com", company: 7 },
    { name: "Nadia Khan", phone: "+923081234567", email: "nadia@procreatestudios.pk", company: 8 },
    { name: "Imran Butt", phone: "+923091234567", email: "imran@unitydev.pk", company: 9 },
    { name: "Sadia Yousuf", phone: "+923101234567", email: "sadia@gulbergresidency.pk", company: 0 },
    { name: "Kamran Javed", phone: "+923111234567", email: "kamran@chasetextiles.com", company: 1 },
  ];
  const contacts = await Promise.all(
    contactSpecs.map((c, i) =>
      prisma.contact.create({
        data: {
          workspaceId: workspace.id,
          name: c.name,
          phone: c.phone,
          email: c.email,
          companyId: companies[c.company].id,
          tags: i % 3 === 0 ? ["referral"] : i % 3 === 1 ? ["website"] : ["walk-in"],
          customFields: { preferred_language: i % 2 === 0 ? "Urdu" : "English" },
        },
      })
    )
  );

  // --- deals across the residential board ------------------------------------
  const dealSpecs = [
    { name: "Follow up on 5 kW quote", stage: 0, value: 850_000, tag: "Rooftop", contact: 0, owner: bilal },
    { name: "Discovery call booked", stage: 0, value: 1_500_000, tag: "Rooftop", contact: 1, owner: sara },
    { name: "Discussing battery backup", stage: 0, value: 2_500_000, tag: "Hybrid", contact: 2, owner: bilal },
    { name: "Reach back out to Dylan", stage: 0, value: 500_000, tag: "Rooftop", contact: 3, owner: sara },
    { name: "Site survey scheduled", stage: 1, value: 1_000_000, tag: "Rooftop", contact: 4, owner: bilal, fields: { roof_type: "Concrete", system_size_kw: 10 } },
    { name: "Roof access assessment", stage: 1, value: 1_200_000, tag: "Hybrid", contact: 5, owner: sara, fields: { roof_type: "Metal sheet", system_size_kw: 12 } },
    { name: "Shading analysis pending", stage: 1, value: 950_000, tag: "Rooftop", contact: 6, owner: bilal, fields: { roof_type: "Tile" } },
    { name: "Net metering paperwork", stage: 2, value: 3_500_000, tag: "Commercial", contact: 7, owner: sara, fields: { roof_type: "Flat", system_size_kw: 35 } },
    { name: "Proposal sent - 25 kW", stage: 2, value: 2_500_000, tag: "Hybrid", contact: 8, owner: bilal, fields: { roof_type: "Concrete", system_size_kw: 25 } },
    { name: "Financing options shared", stage: 2, value: 1_800_000, tag: "Rooftop", contact: 9, owner: sara, fields: { roof_type: "Metal sheet", system_size_kw: 18 } },
    { name: "Installation complete", stage: 3, value: 2_500_000, tag: "Rooftop", contact: 10, owner: bilal, fields: { roof_type: "Concrete", system_size_kw: 25 } },
    { name: "15 kW hybrid delivered", stage: 3, value: 1_500_000, tag: "Hybrid", contact: 11, owner: sara, fields: { roof_type: "Tile", system_size_kw: 15 } },
    { name: "Repeat customer - extension", stage: 3, value: 900_000, tag: "Rooftop", contact: 0, owner: bilal, fields: { roof_type: "Concrete", system_size_kw: 9 } },
    { name: "Went with competitor", stage: 4, value: 1_100_000, tag: "Rooftop", contact: 1, owner: sara, fields: { roof_type: "Flat", system_size_kw: 11 } },
    { name: "Budget postponed to next year", stage: 4, value: 700_000, tag: "Rooftop", contact: 2, owner: bilal, fields: { roof_type: "Tile", system_size_kw: 7 } },
  ];

  const deals = [];
  for (const spec of dealSpecs) {
    const stage = resStages[spec.stage];
    const deal = await prisma.opportunity.create({
      data: {
        workspaceId: workspace.id,
        name: spec.name,
        value: new Prisma.Decimal(spec.value),
        currency: "PKR",
        tag: spec.tag,
        contactId: contacts[spec.contact].id,
        pipelineId: residential.id,
        stageId: stage.id,
        ownerId: spec.owner.id,
        customFields: (spec.fields ?? {}) as Prisma.InputJsonValue,
        closedAt: stage.type === "OPEN" ? null : new Date(),
      },
    });
    deals.push(deal);
  }

  // --- payments: 12 months of history so the revenue chart has a shape -------
  const wonDeals = deals.filter((_, i) => dealSpecs[i].stage === 3);
  for (const deal of wonDeals) {
    await prisma.payment.create({
      data: {
        workspaceId: workspace.id,
        opportunityId: deal.id,
        amount: deal.value,
        currency: "PKR",
        status: "PAID",
        // Full id, not a prefix: cuids share a leading segment, so slicing
        // produced collisions across deals.
        providerRef: `pi_seed_${deal.id}`,
        requestedBy: deal.ownerId,
        paidAt: new Date(),
      },
    });
  }
  // Historical paid amounts spread over the previous 11 months.
  const historical = [420_000, 680_000, 510_000, 930_000, 760_000, 1_240_000, 880_000, 1_450_000, 1_020_000, 1_680_000, 1_320_000];
  for (let i = 0; i < historical.length; i++) {
    const paidAt = new Date();
    paidAt.setMonth(paidAt.getMonth() - (historical.length - i));
    paidAt.setDate(15);
    await prisma.payment.create({
      data: {
        workspaceId: workspace.id,
        opportunityId: wonDeals[i % wonDeals.length].id,
        amount: new Prisma.Decimal(historical[i]),
        currency: "PKR",
        status: "PAID",
        providerRef: `pi_hist_${i}`,
        paidAt,
      },
    });
  }
  // One pending and one refunded so the status variants are visible.
  await prisma.payment.create({
    data: {
      workspaceId: workspace.id,
      opportunityId: deals[7].id,
      amount: new Prisma.Decimal(700_000),
      currency: "PKR",
      status: "PENDING",
      providerRef: "cs_seed_pending",
    },
  });
  await prisma.payment.create({
    data: {
      workspaceId: workspace.id,
      opportunityId: deals[13].id,
      amount: new Prisma.Decimal(300_000),
      currency: "PKR",
      status: "REFUNDED",
      providerRef: "pi_seed_refunded",
      paidAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
    },
  });

  // --- appointments (the Google Calendar integration lands later; these are
  // real rows so the dashboard panel and customer page have something true) ---
  const apptSpecs = [
    { title: "Site survey - Gulberg", contact: 0, inHours: 3 },
    { title: "Proposal walkthrough", contact: 8, inHours: 26 },
    { title: "Technical review call", contact: 7, inHours: 50 },
  ];
  for (const a of apptSpecs) {
    const startsAt = new Date(Date.now() + a.inHours * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    await prisma.appointment.create({
      data: {
        workspaceId: workspace.id,
        title: a.title,
        contactId: contacts[a.contact].id,
        startsAt,
        endsAt,
        ownerId: bilal.id,
      },
    });
  }

  // --- leads: a mix of acknowledged, escalated and fresh ----------------------
  const leadSpecs = [
    { name: "Ayesha Siddiqui", phone: "+923001234567", source: "WHATSAPP" as const, status: "ACKNOWLEDGED" as const, owner: bilal, ackMinutes: 2, escalations: 0 },
    { name: "Website enquiry - 10 kW", phone: "+923121234567", source: "WEB_FORM" as const, status: "ACKNOWLEDGED" as const, owner: sara, ackMinutes: 7, escalations: 1 },
    { name: "Walk-in - Model Town", phone: "+923131234567", source: "MANUAL" as const, status: "ACKNOWLEDGED" as const, owner: bilal, ackMinutes: 1, escalations: 0 },
    { name: "Commercial enquiry - 3 sites", phone: "+923141234567", source: "WEB_FORM" as const, status: "ESCALATED" as const, owner: manager, ackMinutes: null, escalations: 2 },
    { name: "WhatsApp - battery pricing", phone: "+923151234567", source: "WHATSAPP" as const, status: "ASSIGNED" as const, owner: sara, ackMinutes: null, escalations: 0 },
  ];

  for (const spec of leadSpecs) {
    const createdAt = new Date(Date.now() - (30 + Math.random() * 300) * 60 * 1000);
    const firstAssignedAt = new Date(createdAt.getTime() + 2000);
    const lead = await prisma.lead.create({
      data: {
        workspaceId: workspace.id,
        source: spec.source,
        name: spec.name,
        phone: spec.phone,
        status: spec.status,
        currentOwnerId: spec.owner.id,
        createdAt,
        firstAssignedAt,
        firstAckAt: spec.ackMinutes !== null ? new Date(firstAssignedAt.getTime() + spec.ackMinutes * 60 * 1000) : null,
        escalationCount: spec.escalations,
      },
    });
    await prisma.leadAssignment.create({
      data: {
        leadId: lead.id,
        assigneeId: spec.owner.id,
        assignedAt: firstAssignedAt,
        ackAt: spec.ackMinutes !== null ? new Date(firstAssignedAt.getTime() + spec.ackMinutes * 60 * 1000) : null,
        endedAt: spec.ackMinutes !== null ? new Date(firstAssignedAt.getTime() + spec.ackMinutes * 60 * 1000) : null,
        endReason: spec.ackMinutes !== null ? "ACKNOWLEDGED" : null,
        escalationLevel: spec.escalations,
      },
    });
    // Audit entries so the escalation figures and timeline aren't empty.
    for (let i = 0; i < spec.escalations; i++) {
      await prisma.auditLog.create({
        data: {
          workspaceId: workspace.id,
          actorLabel: "system:escalation",
          eventType: "lead.escalated",
          targetType: "Lead",
          targetId: lead.id,
          createdAt: new Date(firstAssignedAt.getTime() + (i + 1) * 60 * 1000),
          after: { escalationLevel: i + 1 },
        },
      });
    }
  }

  // Backdated escalation history so the dashboard's 7-day chart shows a
  // trend rather than a single spike on seed day.
  const escalationsPerDay = [4, 2, 5, 3, 6, 2];
  const historyLead = await prisma.lead.findFirst({ where: { workspaceId: workspace.id } });
  if (historyLead) {
    for (let dayOffset = 6; dayOffset >= 1; dayOffset--) {
      const count = escalationsPerDay[6 - dayOffset];
      for (let i = 0; i < count; i++) {
        const createdAt = new Date();
        createdAt.setDate(createdAt.getDate() - dayOffset);
        createdAt.setHours(9 + (i % 8), (i * 7) % 60, 0, 0);
        await prisma.auditLog.create({
          data: {
            workspaceId: workspace.id,
            actorLabel: "system:escalation",
            eventType: "lead.escalated",
            targetType: "Lead",
            targetId: historyLead.id,
            createdAt,
            after: { escalationLevel: (i % 3) + 1 },
          },
        });
      }
    }
  }

  console.log(`Seeded '${WORKSPACE_NAME}' (password: password123)`);
  console.log(`  Owner:    ${owner.email}`);
  console.log(`  Admin:    ${admin.email}`);
  console.log(`  Manager:  ${manager.email}`);
  console.log(`  Rep:      ${bilal.email} (Available)`);
  console.log(`  Rep:      ${sara.email} (Available)`);
  console.log(`  Rep:      ${omar.email} (Offline)`);
  console.log(`  ${companies.length} companies, ${contacts.length} contacts, ${deals.length} deals`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
