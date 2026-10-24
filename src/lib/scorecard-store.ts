import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-guard";
import { buildScorecard, type ScorecardData } from "@/lib/scorecard";

/** Builds and saves the report's scorecard snapshot, bumping its version when regenerated. */
export async function generateScorecard(reportId: string, userId: string | null) {
  const data = (await buildScorecard(reportId)) as unknown as Prisma.InputJsonObject;
  return prisma.scorecard.upsert({
    where: { reportId },
    create: { reportId, data, generatedById: userId },
    update: { data, generatedAt: new Date(), generatedById: userId, version: { increment: 1 } },
  });
}

export function scorecardData(json: Prisma.JsonValue): ScorecardData {
  return json as unknown as ScorecardData;
}

/**
 * Scorecard for a download, or the error response to send. Published scorecards are readable
 * with dashboard access; drafts need report access.
 */
export async function scorecardForDownload(reportId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  const scorecard = await prisma.scorecard.findUnique({ where: { reportId } });
  if (!scorecard) return { error: NextResponse.json({ error: "This report has no scorecard yet" }, { status: 404 }) };
  if (!user.permissions.has("reports.view") && !(scorecard.publishedAt && user.permissions.has("view.dashboard"))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { scorecard, data: scorecardData(scorecard.data), status: { version: scorecard.version, publishedAt: scorecard.publishedAt?.toISOString() ?? null } };
}
