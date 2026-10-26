import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, parseJson, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { isFiscalMonth } from "@/lib/fiscal";

const ruleSchema = z.object({
  effectiveFrom: z.number().int().refine(isFiscalMonth, "must be a fiscal month (YYYYMM)"),
  thresholdPct: z.number().min(0).max(100),
  offsetType: z.enum(["NONE", "FLAT", "PCT_VALUE"]),
  offsetAmount: z.number().min(0).max(1_000_000),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export async function POST(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("admin.programs");
  if (guard.error) return guard.error;
  const { id } = await params;
  const body = await parseJson(req, ruleSchema);
  if (body.error) return body.error;
  if (!(await prisma.metric.findUnique({ where: { id } }))) return notFound("Metric not found");
  if (await prisma.metricRule.findUnique({ where: { metricId_effectiveFrom: { metricId: id, effectiveFrom: body.data.effectiveFrom } } })) {
    return badRequest("A rule already starts in that fiscal month");
  }
  const rule = await prisma.metricRule.create({ data: { ...body.data, metricId: id } });
  await audit(guard.user.id, "rule.create", "MetricRule", rule.id, body.data);
  return NextResponse.json({ id: rule.id }, { status: 201 });
}
