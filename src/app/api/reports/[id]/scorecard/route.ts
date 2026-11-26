import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { generateScorecard } from "@/lib/scorecard-store";

/** Regenerates the snapshot, e.g. after recording THD decisions. Published scorecards are frozen. */
export async function POST(_req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("reports.advance");
  if (guard.error) return guard.error;
  const { id } = await params;
  const report = await prisma.complianceReport.findUnique({ where: { id } });
  if (!report) return notFound("Report not found");
  if (report.status !== "SCORECARD") return badRequest("Scorecards can only be regenerated in the Scorecard stage; unpublish first");
  const scorecard = await generateScorecard(id, guard.user.id);
  await audit(guard.user.id, "scorecard.generate", "Scorecard", scorecard.id, { version: scorecard.version });
  return NextResponse.json({ version: scorecard.version });
}
