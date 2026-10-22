import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, parseJson, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";

const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
const schema = z.object({
  disputeOpen: isoDate,
  disputeClose: isoDate,
  /** Also move the due date of disputes not yet submitted */
  updateDueDates: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("disputes.manage");
  if (guard.error) return guard.error;
  const { id } = await params;
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  const open = new Date(`${body.data.disputeOpen}T00:00:00Z`);
  const close = new Date(`${body.data.disputeClose}T00:00:00Z`);
  if (close < open) return badRequest("The window must close after it opens");
  const period = await prisma.compliancePeriod.findUnique({ where: { id } });
  if (!period) return notFound("Period not found");

  await prisma.compliancePeriod.update({ where: { id }, data: { disputeOpen: open, disputeClose: close } });
  let moved = 0;
  if (body.data.updateDueDates) {
    const res = await prisma.dispute.updateMany({
      where: { status: { in: ["PREPARING", "READY"] }, line: { fiscalMonth: period.fiscalMonth } },
      data: { dueDate: close },
    });
    moved = res.count;
  }
  await audit(guard.user.id, "period.disputeWindow", "CompliancePeriod", id, { ...body.data, moved });
  return NextResponse.json({ ok: true, moved });
}
