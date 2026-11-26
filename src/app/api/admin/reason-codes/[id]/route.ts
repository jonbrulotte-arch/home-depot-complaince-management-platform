import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { notFound, parseJson, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";

// Reason codes are deactivated rather than deleted, because disputes refer to them
const schema = z.object({ active: z.boolean() });

export async function PATCH(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("admin.programs");
  if (guard.error) return guard.error;
  const { id } = await params;
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  if (!(await prisma.disputeReasonCode.findUnique({ where: { id } }))) return notFound("Reason code not found");
  await prisma.disputeReasonCode.update({ where: { id }, data: body.data });
  await audit(guard.user.id, "reasonCode.update", "DisputeReasonCode", id, body.data);
  return NextResponse.json({ ok: true });
}
