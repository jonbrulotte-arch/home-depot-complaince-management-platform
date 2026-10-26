import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { notFound, parseJson, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  sheetNames: z.array(z.string().trim().min(1).max(100)).min(1).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("admin.programs");
  if (guard.error) return guard.error;
  const { id } = await params;
  const body = await parseJson(req, patchSchema);
  if (body.error) return body.error;
  if (!(await prisma.metric.findUnique({ where: { id } }))) return notFound("Metric not found");
  await prisma.metric.update({ where: { id }, data: body.data });
  await audit(guard.user.id, "metric.update", "Metric", id, body.data);
  return NextResponse.json({ ok: true });
}
