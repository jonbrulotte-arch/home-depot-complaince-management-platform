import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";

export async function DELETE(_req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("admin.programs");
  if (guard.error) return guard.error;
  const { id } = await params;
  const rule = await prisma.metricRule.findUnique({ where: { id } });
  if (!rule) return notFound("Rule not found");
  if ((await prisma.metricRule.count({ where: { metricId: rule.metricId } })) <= 1) {
    return badRequest("A metric must keep at least one rule");
  }
  await prisma.metricRule.delete({ where: { id } });
  await audit(guard.user.id, "rule.delete", "MetricRule", id, { metricId: rule.metricId, effectiveFrom: rule.effectiveFrom });
  return NextResponse.json({ ok: true });
}
