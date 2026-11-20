import type { DataPeriod } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Purging a program's imports for one compliance period of a report undoes them: the lines those imports created go,
// with their reviews and disputes (cascade). Lines that were already in the database and were
// only updated by these imports stay, pointed back at the import that created them.

export interface PurgeSummary {
  imports: number;
  /** Lines the imports created, which a purge deletes */
  linesRemoved: number;
  /** Lines that existed before and are kept */
  linesKept: number;
  reviews: number;
  disputes: number;
}

async function batchIds(reportProgramId: string, period: DataPeriod) {
  return (await prisma.importBatch.findMany({ where: { reportProgramId, period }, select: { id: true } })).map((b) => b.id);
}

/** What a purge would remove, for the confirmation dialog. */
export async function purgePreview(reportProgramId: string, period: DataPeriod): Promise<PurgeSummary> {
  const ids = await batchIds(reportProgramId, period);
  const created = { createdBatchId: { in: ids } };
  const [linesRemoved, linesKept, reviews, disputes] = await Promise.all([
    prisma.complianceLine.count({ where: created }),
    prisma.complianceLine.count({ where: { batchId: { in: ids }, NOT: created } }),
    prisma.lineReview.count({ where: { line: created } }),
    prisma.dispute.count({ where: { line: created } }),
  ]);
  return { imports: ids.length, linesRemoved, linesKept, reviews, disputes };
}

export async function purgeReportProgramImports(reportProgramId: string, period: DataPeriod): Promise<PurgeSummary> {
  const summary = await purgePreview(reportProgramId, period);
  const ids = await batchIds(reportProgramId, period);
  await prisma.$transaction(
    async (tx) => {
      const created = { createdBatchId: { in: ids } };
      const pos = (await tx.complianceLine.findMany({ where: created, distinct: ["poRecordId"], select: { poRecordId: true } }))
        .map((l) => l.poRecordId)
        .filter((id): id is string => id !== null);
      await tx.complianceLine.deleteMany({ where: created });

      // Lines these imports only updated go back to the import that created them, when it still exists
      const kept = await tx.complianceLine.findMany({ where: { batchId: { in: ids } }, select: { id: true, createdBatchId: true } });
      const creators = new Set(
        (await tx.importBatch.findMany({ where: { id: { in: kept.flatMap((l) => (l.createdBatchId ? [l.createdBatchId] : [])) } }, select: { id: true } })).map((b) => b.id),
      );
      for (const line of kept) {
        if (line.createdBatchId && creators.has(line.createdBatchId)) {
          await tx.complianceLine.update({ where: { id: line.id }, data: { batchId: line.createdBatchId } });
        }
      }
      // Imports still holding lines (creator unknown) are detached from the report instead of deleted
      const holding = new Set((await tx.complianceLine.findMany({ where: { batchId: { in: ids } }, distinct: ["batchId"], select: { batchId: true } })).map((l) => l.batchId));
      await tx.importBatch.deleteMany({ where: { id: { in: ids.filter((id) => !holding.has(id)) } } });
      if (holding.size) await tx.importBatch.updateMany({ where: { id: { in: [...holding] } }, data: { reportProgramId: null } });

      // PO records that no longer have any lines
      if (pos.length) await tx.poRecord.deleteMany({ where: { id: { in: pos }, lines: { none: {} } } });
      // The other period's imports are independent; the program has no data only once both are gone
      if (!(await tx.importBatch.count({ where: { reportProgramId } }))) {
        await tx.reportProgram.update({ where: { id: reportProgramId }, data: { status: "NOT_STARTED" } });
      }
    },
    { timeout: 300_000, maxWait: 30_000 },
  );
  return summary;
}
