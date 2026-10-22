import { NextResponse } from "next/server";
import { z } from "zod";
import type { ReportStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, parseJson, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { syncDisputes } from "@/lib/dispute-sync";
import { generateScorecard } from "@/lib/scorecard-store";

const FLOW: ReportStatus[] = ["DRAFT", "IN_REVIEW", "DISPUTES", "SCORECARD", "PUBLISHED"];

const patchSchema = z.object({
  status: z.enum(["DRAFT", "IN_REVIEW", "DISPUTES", "SCORECARD", "PUBLISHED"]).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

export async function PATCH(req: Request, { params }: IdParams) {
  const { id } = await params;
  const body = await parseJson(req, patchSchema);
  if (body.error) return body.error;
  const guard = await requireApiPermission(body.data.status ? "reports.advance" : "reports.create");
  if (guard.error) return guard.error;

  const report = await prisma.complianceReport.findUnique({ where: { id }, include: { period: true, programs: true } });
  if (!report) return notFound("Report not found");

  const { status, notes } = body.data;
  if (status && status !== report.status) {
    const from = FLOW.indexOf(report.status);
    const to = FLOW.indexOf(status);
    if (from < 0 || Math.abs(to - from) !== 1) return badRequest(`Cannot move a report from ${report.status} to ${status}`);
    const hasLines = () =>
      prisma.complianceLine.count({
        where: { fiscalMonth: report.period.fiscalMonth, metric: { programId: { in: report.programs.map((p) => p.programId) } } },
      });
    if (status === "IN_REVIEW" && report.status === "DRAFT" && (await hasLines()) === 0) {
      return badRequest("Import data for at least one program before starting the review");
    }
    if (status === "DISPUTES") {
      const pending = await prisma.complianceLine.count({
        where: {
          fiscalMonth: report.period.fiscalMonth,
          isCompliant: false,
          metric: { programId: { in: report.programs.map((p) => p.programId) } },
          OR: [{ review: null }, { review: { disposition: { in: ["PENDING", "NEEDS_RESEARCH"] } } }],
        },
      });
      if (pending) return badRequest(`${pending} non-compliant line(s) still need a decision`);
    }
    if (status === "SCORECARD" && report.status === "DISPUTES") {
      const unsubmitted = await prisma.dispute.count({
        where: {
          status: { in: ["PREPARING", "READY"] },
          line: { fiscalMonth: report.period.fiscalMonth, metric: { programId: { in: report.programs.map((p) => p.programId) } } },
        },
      });
      if (unsubmitted) return badRequest(`${unsubmitted} dispute(s) are not submitted yet; submit or withdraw them first`);
    }
  }

  const updated = await prisma.complianceReport.update({
    where: { id },
    data: { ...(status ? { status } : {}), ...(notes !== undefined ? { notes } : {}) },
  });
  // Entering the dispute stage turns every Disputable line into a dispute to work
  const disputes = status === "DISPUTES" && report.status === "IN_REVIEW" ? await syncDisputes(id, guard.user.id) : null;
  if (status === "SCORECARD" && report.status === "DISPUTES") await generateScorecard(id, guard.user.id);
  if (status === "PUBLISHED") {
    await prisma.scorecard.update({ where: { reportId: id }, data: { publishedAt: new Date(), publishedById: guard.user.id } });
  }
  if (status === "SCORECARD" && report.status === "PUBLISHED") {
    await prisma.scorecard.update({ where: { reportId: id }, data: { publishedAt: null, publishedById: null } });
  }
  await audit(guard.user.id, status ? "report.status" : "report.update", "ComplianceReport", id, { ...body.data, disputes });
  return NextResponse.json({ id: updated.id, status: updated.status, disputes });
}
