import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, parseJson, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { normalizePackageId } from "@/lib/package-id";
import { periodOfMetric } from "@/lib/shipment-ranges";

const schema = z.object({
  programId: z.string().trim().min(1),
  period: z.enum(["FILL_ON_TIME", "OTHER"]),
  packageId: z.string().trim().max(64).nullable(),
});

/**
 * Sets (or clears, with null) the chargeback Package ID for one program's compliance period.
 * Allowed at any stage, published included: the ID often arrives with THD's remittance, later.
 */
export async function PUT(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("reports.import");
  if (guard.error) return guard.error;
  const { id } = await params;
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  const { programId, period } = body.data;
  const packageId = body.data.packageId ? normalizePackageId(body.data.packageId) : null;
  if (body.data.packageId && !packageId) return badRequest("A Package ID is letters and digits, with - _ . / between");

  const report = await prisma.complianceReport.findUnique({
    where: { id },
    include: { programs: { where: { programId }, include: { program: { include: { metrics: { where: { active: true }, select: { code: true } } } } } } },
  });
  if (!report) return notFound("Report not found");
  const program = report.programs[0]?.program;
  if (!program) return badRequest("That program is not in this report");
  if (!program.metrics.some((m) => periodOfMetric(m.code) === period)) return badRequest(`${program.name} has no metrics in that compliance period`);

  if (packageId === null) {
    await prisma.chargebackPackage.deleteMany({ where: { reportId: id, programId, period } });
  } else {
    await prisma.chargebackPackage.upsert({
      where: { reportId_programId_period: { reportId: id, programId, period } },
      create: { reportId: id, programId, period, packageId, updatedById: guard.user.id },
      update: { packageId, updatedById: guard.user.id },
    });
  }
  await audit(guard.user.id, "report.packageId", "ComplianceReport", id, { programId, period, packageId });
  return NextResponse.json({ ok: true });
}
