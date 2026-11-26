import { prisma } from "@/lib/prisma";
import { lineCountKey } from "@/lib/scorecard-rules";

/** A report's entered line counts, keyed by program and compliance period (`lineCountKey`). */
export async function getLineCounts(reportId: string): Promise<Record<string, number>> {
  const rows = await prisma.lineCount.findMany({ where: { reportId }, select: { programId: true, period: true, count: true } });
  return Object.fromEntries(rows.map((r) => [lineCountKey(r.programId, r.period), r.count]));
}
