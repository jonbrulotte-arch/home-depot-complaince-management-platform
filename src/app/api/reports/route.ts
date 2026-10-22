import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { fiscalLabel, isFiscalMonth } from "@/lib/fiscal";

const createSchema = z.object({
  fiscalMonth: z.number().int().refine(isFiscalMonth, "must be a fiscal month (YYYYMM)"),
  programIds: z.array(z.string().trim().min(1)).min(1, "select at least one program"),
  notes: z.string().trim().max(5000).optional(),
});

export async function POST(req: Request) {
  const guard = await requireApiPermission("reports.create");
  if (guard.error) return guard.error;
  const body = await parseJson(req, createSchema);
  if (body.error) return body.error;
  const { fiscalMonth, programIds, notes } = body.data;

  const programs = await prisma.program.findMany({ where: { id: { in: programIds }, active: true }, select: { id: true } });
  if (programs.length !== new Set(programIds).size) return badRequest("Unknown or inactive program selected");

  // Programs whose data for this period is already loaded (e.g. by the backfill) start as imported
  const withData = await prisma.complianceLine.groupBy({
    by: ["metricId"],
    where: { fiscalMonth, metric: { programId: { in: programs.map((p) => p.id) } } },
  });
  const loaded = new Set(
    (await prisma.metric.findMany({ where: { id: { in: withData.map((g) => g.metricId) } }, select: { programId: true } })).map((m) => m.programId),
  );

  const label = fiscalLabel(fiscalMonth);
  const period = await prisma.compliancePeriod.upsert({ where: { fiscalMonth }, update: {}, create: { fiscalMonth, label } });
  const report = await prisma.complianceReport.create({
    data: {
      periodId: period.id,
      title: `${label} Compliance Report`,
      notes: notes || null,
      createdById: guard.user.id,
      programs: { create: programs.map((p) => ({ programId: p.id, status: loaded.has(p.id) ? "IMPORTED" : "NOT_STARTED" })) },
    },
  });
  await audit(guard.user.id, "report.create", "ComplianceReport", report.id, { fiscalMonth, programIds });
  return NextResponse.json({ id: report.id }, { status: 201 });
}
