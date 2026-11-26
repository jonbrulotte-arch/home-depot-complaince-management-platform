import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { syncDisputes } from "@/lib/dispute-sync";

export async function POST(_req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("disputes.manage");
  if (guard.error) return guard.error;
  const { id } = await params;
  const report = await prisma.complianceReport.findUnique({ where: { id } });
  if (!report) return notFound("Report not found");
  if (report.status === "DRAFT" || report.status === "IN_REVIEW") return badRequest("Move the report to Disputes first");
  const result = await syncDisputes(id, guard.user.id);
  await audit(guard.user.id, "disputes.sync", "ComplianceReport", id, { ...result });
  return NextResponse.json(result);
}
