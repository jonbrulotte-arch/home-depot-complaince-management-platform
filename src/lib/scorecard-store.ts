import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
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
