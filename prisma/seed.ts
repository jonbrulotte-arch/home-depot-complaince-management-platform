import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { DEFAULT_ROLES } from "../src/lib/permissions";
import { DEFAULT_ALIASES, PROGRAM_CATALOG, RULES_EFFECTIVE_FROM } from "../src/lib/import/catalog";
import { fiscalLabel, shiftFiscalMonth } from "../src/lib/fiscal";

// Idempotent: existing rows keep any changes admins have made; only missing rows are added.
async function main() {
  for (const role of DEFAULT_ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: role.name === "Admin" ? { permissions: role.permissions } : {},
      create: { ...role, system: true },
    });
  }

  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (email && password) {
    const admin = await prisma.role.findUniqueOrThrow({ where: { name: "Admin" } });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      await prisma.user.create({
        data: { email, name: process.env.SEED_ADMIN_NAME?.trim() || "Administrator", passwordHash: await bcrypt.hash(password, 12), roleId: admin.id },
      });
      console.log(`Created admin user ${email}`);
    }
  } else {
    console.warn("SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set; no admin user created.");
  }

  for (const [pi, p] of PROGRAM_CATALOG.entries()) {
    const program = await prisma.program.upsert({
      where: { code: p.code },
      update: {},
      create: { code: p.code, name: p.name, filePrefix: p.filePrefix, sortOrder: pi },
    });
    for (const [mi, m] of p.metrics.entries()) {
      const metric = await prisma.metric.upsert({
        where: { programId_code: { programId: program.id, code: m.code } },
        update: {},
        create: { programId: program.id, code: m.code, name: m.name, sheetNames: m.sheetNames, sortOrder: mi },
      });
      await prisma.metricRule.upsert({
        where: { metricId_effectiveFrom: { metricId: metric.id, effectiveFrom: RULES_EFFECTIVE_FROM } },
        update: {},
        create: {
          metricId: metric.id,
          effectiveFrom: RULES_EFFECTIVE_FROM,
          thresholdPct: m.thresholdPct,
          offsetType: m.offsetType,
          offsetAmount: m.offsetAmount,
          notes: m.ruleNotes,
        },
      });
      for (const rc of m.reasonCodes ?? []) {
        await prisma.disputeReasonCode.upsert({
          where: { metricId_code: { metricId: metric.id, code: rc.code } },
          update: {},
          create: { metricId: metric.id, ...rc },
        });
      }
    }
  }

  // Global aliases have null program/metric ids, which a unique index does not dedupe
  const globals = new Set(
    (await prisma.columnAlias.findMany({ where: { programId: null, metricId: null } })).map((a) => a.sourceHeader),
  );
  const missing = Object.entries(DEFAULT_ALIASES).filter(([header]) => !globals.has(header));
  if (missing.length) {
    await prisma.columnAlias.createMany({ data: missing.map(([sourceHeader, canonicalField]) => ({ sourceHeader, canonicalField })) });
  }

  for (let fm = 202301; fm <= 202712; fm = shiftFiscalMonth(fm, 1)) {
    await prisma.compliancePeriod.upsert({ where: { fiscalMonth: fm }, update: {}, create: { fiscalMonth: fm, label: fiscalLabel(fm) } });
  }
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
