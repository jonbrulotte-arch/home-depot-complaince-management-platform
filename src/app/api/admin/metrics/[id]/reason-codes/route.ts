import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, parseJson, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z.object({
  code: z.string().trim().min(1).max(200),
  whenToUse: z.string().trim().max(1000).nullable().optional(),
  requiredDocs: z.string().trim().max(1000).nullable().optional(),
  docDetails: z.string().trim().max(1000).nullable().optional(),
});

export async function POST(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("admin.programs");
  if (guard.error) return guard.error;
  const { id } = await params;
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  if (!(await prisma.metric.findUnique({ where: { id } }))) return notFound("Metric not found");
  const existing = await prisma.disputeReasonCode.findUnique({ where: { metricId_code: { metricId: id, code: body.data.code } } });
  if (existing?.active) return badRequest("That reason code already exists for this metric");
  const data = { whenToUse: body.data.whenToUse || null, requiredDocs: body.data.requiredDocs || null, docDetails: body.data.docDetails || null };
  const code = existing
    ? await prisma.disputeReasonCode.update({ where: { id: existing.id }, data: { ...data, active: true } })
    : await prisma.disputeReasonCode.create({ data: { ...data, code: body.data.code, metricId: id } });
  await audit(guard.user.id, "reasonCode.create", "DisputeReasonCode", code.id, body.data);
  return NextResponse.json({ id: code.id }, { status: 201 });
}
