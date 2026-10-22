import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, parseJson, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { SHIPMENT_PROGRAMS } from "@/lib/shipments";

const schema = z.object({
  counts: z
    .array(
      z.object({
        programId: z.string().trim().min(1),
        mode: z.enum(["SMALL_PARCEL", "LTL_TL"]),
        count: z.number().int().min(0).max(10_000_000).nullable(),
      }),
    )
    .max(20),
});

export async function PUT(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("reports.import");
  if (guard.error) return guard.error;
  const { id } = await params;
  const body = await parseJson(req, schema);
  if (body.error) return body.error;

  const report = await prisma.complianceReport.findUnique({ where: { id }, include: { programs: { include: { program: true } } } });
  if (!report) return notFound("Report not found");
  if (report.status === "PUBLISHED") return badRequest("Unpublish the scorecard before changing shipment counts");
  const allowed = new Set(report.programs.filter((p) => SHIPMENT_PROGRAMS.includes(p.program.code)).map((p) => p.programId));
  if (body.data.counts.some((c) => !allowed.has(c.programId))) return badRequest("Shipment counts apply to the report's Drop Ship, RDC and DFC programs");

  await prisma.$transaction(
    body.data.counts.map(({ programId, mode, count }) =>
      count === null
        ? prisma.shipmentCount.deleteMany({ where: { reportId: id, programId, mode } })
        : prisma.shipmentCount.upsert({
            where: { reportId_programId_mode: { reportId: id, programId, mode } },
            create: { reportId: id, programId, mode, count, updatedById: guard.user.id },
            update: { count, updatedById: guard.user.id },
          }),
    ),
  );
  await audit(guard.user.id, "report.shipments", "ComplianceReport", id, body.data);
  return NextResponse.json({ ok: true });
}
