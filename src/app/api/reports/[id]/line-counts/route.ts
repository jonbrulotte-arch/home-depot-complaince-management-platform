import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, parseJson, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { periodOfMetric } from "@/lib/shipment-ranges";

const schema = z.object({
  programId: z.string().trim().min(1),
  period: z.enum(["FILL_ON_TIME", "OTHER"]),
  count: z.number().int().min(0).max(10_000_000).nullable(),
});

/** Sets (or clears, with null) the lines in one program's compliance period. */
export async function PUT(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("reports.import");
  if (guard.error) return guard.error;
  const { id } = await params;
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  const { programId, period, count } = body.data;

  const report = await prisma.complianceReport.findUnique({
    where: { id },
    include: { programs: { where: { programId }, include: { program: { include: { metrics: { where: { active: true }, select: { code: true } } } } } } },
  });
  if (!report) return notFound("Report not found");
  if (report.status === "PUBLISHED") return badRequest("Unpublish the scorecard before changing line counts");
  const program = report.programs[0]?.program;
  if (!program) return badRequest("That program is not in this report");
  if (!program.metrics.some((m) => periodOfMetric(m.code) === period)) return badRequest(`${program.name} has no metrics in that compliance period`);

  if (count === null) {
    await prisma.lineCount.deleteMany({ where: { reportId: id, programId, period } });
  } else {
    await prisma.lineCount.upsert({
      where: { reportId_programId_period: { reportId: id, programId, period } },
      create: { reportId: id, programId, period, count, updatedById: guard.user.id },
      update: { count, updatedById: guard.user.id },
    });
  }
  await audit(guard.user.id, "report.lineCount", "ComplianceReport", id, body.data);
  return NextResponse.json({ ok: true });
}
