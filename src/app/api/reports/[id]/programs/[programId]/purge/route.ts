import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound } from "@/lib/api";
import { audit } from "@/lib/audit";
import { purgePreview, purgeReportProgramImports } from "@/lib/purge";
import type { DataPeriod } from "@prisma/client";

type Params = { params: Promise<{ id: string; programId: string }> };

/** ?period=FILL_ON_TIME|OTHER: the compliance period whose imports to purge */
function periodOf(req: Request): DataPeriod | null {
  const value = new URL(req.url).searchParams.get("period") ?? "OTHER";
  return value === "FILL_ON_TIME" || value === "OTHER" ? value : null;
}

async function load(id: string, programId: string) {
  const reportProgram = await prisma.reportProgram.findUnique({
    where: { reportId_programId: { reportId: id, programId } },
    include: { report: { select: { status: true } }, program: { select: { name: true } } },
  });
  if (!reportProgram) return { error: notFound("Program is not part of this report") };
  // Once disputes exist the lines carry work that a purge would destroy
  if (reportProgram.report.status !== "DRAFT" && reportProgram.report.status !== "IN_REVIEW") {
    return { error: badRequest("Imported data can only be purged while the report is in Draft or In Review") };
  }
  return { reportProgram };
}

/** What a purge would remove */
export async function GET(req: Request, { params }: Params) {
  const guard = await requireApiPermission("reports.import");
  if (guard.error) return guard.error;
  const period = periodOf(req);
  if (!period) return badRequest('period must be "FILL_ON_TIME" or "OTHER"');
  const { id, programId } = await params;
  const { reportProgram, error } = await load(id, programId);
  if (error) return error;
  return NextResponse.json(await purgePreview(reportProgram.id, period));
}

/** Deletes this program's imports for one period of the report and the lines they created */
export async function POST(req: Request, { params }: Params) {
  const guard = await requireApiPermission("reports.import");
  if (guard.error) return guard.error;
  const period = periodOf(req);
  if (!period) return badRequest('period must be "FILL_ON_TIME" or "OTHER"');
  const { id, programId } = await params;
  const { reportProgram, error } = await load(id, programId);
  if (error) return error;
  const summary = await purgeReportProgramImports(reportProgram.id, period);
  await audit(guard.user.id, "report.purge", "ComplianceReport", id, { programId, program: reportProgram.program.name, period, ...summary });
  return NextResponse.json(summary);
}
