import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { notFound, parseJson, type IdParams } from "@/lib/api";

const schema = z.object({ body: z.string().trim().min(1).max(4000) });

export async function POST(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("disputes.manage");
  if (guard.error) return guard.error;
  const { id } = await params;
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  if (!(await prisma.dispute.findUnique({ where: { id }, select: { id: true } }))) return notFound("Dispute not found");
  const event = await prisma.disputeEvent.create({ data: { disputeId: id, type: "NOTE", body: body.data.body, userId: guard.user.id } });
  return NextResponse.json({ id: event.id }, { status: 201 });
}
