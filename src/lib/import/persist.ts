import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { ImportError, parseWorkbook } from "./parse";
import { detectProgram, transformWorkbook, type ConfigAlias, type ConfigProgram, type ImportPreview, type MappedLine } from "./transform";

type Db = PrismaClient;

/** Data cannot arrive before its own fiscal month, so a misfiled export never moves a line earlier. */
export function receivedMonthFor(fiscalMonth: number, receivedMonth: number | null | undefined): number {
  return receivedMonth ? Math.max(receivedMonth, fiscalMonth) : fiscalMonth;
}

export function sha256(buffer: Buffer | ArrayBuffer): string {
  return createHash("sha256").update(Buffer.from(buffer as ArrayBuffer)).digest("hex");
}

export async function loadImportConfig(db: Db): Promise<{ programs: ConfigProgram[]; aliases: ConfigAlias[] }> {
  const [programs, aliases] = await Promise.all([
    db.program.findMany({
      where: { active: true },
      include: { metrics: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
      orderBy: { sortOrder: "asc" },
    }),
    db.columnAlias.findMany(),
  ]);
  return {
    programs: programs.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      filePrefix: p.filePrefix,
      metrics: p.metrics.map((m) => ({ id: m.id, code: m.code, name: m.name, sheetNames: m.sheetNames })),
    })),
    aliases,
  };
}

export interface BuildPreviewArgs {
  buffer: Buffer;
  fileName: string;
  fallbackFiscalMonth: number;
  expectedFiscalMonth?: number;
  /** When set, the file must belong to this program */
  programId?: string;
}

export async function buildPreview(db: Db, args: BuildPreviewArgs): Promise<ImportPreview> {
  const workbook = await parseWorkbook(args.buffer);
  const config = await loadImportConfig(db);
  const detected = detectProgram(args.fileName, workbook.sheets.map((s) => s.name), config.programs);
  const program = args.programId ? config.programs.find((p) => p.id === args.programId) : detected;
  if (!program) throw new ImportError("Could not determine which compliance program this file belongs to.");
  const preview = transformWorkbook(workbook, {
    fileName: args.fileName,
    program,
    aliases: config.aliases,
    fallbackFiscalMonth: args.fallbackFiscalMonth,
    expectedFiscalMonth: args.expectedFiscalMonth,
  });
  // SPM's summary download (…_SUM_…) has THD's totals but no PO lines, so nothing can be reviewed or disputed
  if (!preview.lines.length && !preview.metrics.length && !preview.emptySheets.length && preview.summary.length) {
    throw new ImportError(
      "This is a summary-only export: it has THD's totals but no PO lines. In SPM, download the detail export for the month (\"Export All\", a file named …_EXPORT_ALL_FILTERED_NON_COMPLIANT_RECORDS_…) and import that instead.",
    );
  }
  if (args.programId && detected && detected.id !== args.programId) {
    preview.warnings.unshift(`This file looks like a ${detected.name} export, not ${program.name}.`);
  }
  return preview;
}

function lineData(line: MappedLine, batchId: string, poRecordId: string | null) {
  return {
    batchId,
    poRecordId,
    fiscalMonth: line.fiscalMonth,
    isCompliant: line.isCompliant,
    offsetAmount: line.offsetAmount,
    ...line.fields,
    raw: line.raw as Prisma.InputJsonObject,
    sourceSheet: line.sourceSheet,
    sourceRow: line.sourceRow,
  };
}

export interface PersistArgs {
  preview: ImportPreview;
  fileName: string;
  sha256: string;
  source: "upload" | "backfill";
  reportProgramId?: string | null;
  importedById?: string | null;
  /** Month the file was received (report period or archive folder); defaults to each line's fiscal month */
  receivedMonth?: number | null;
}

export interface PersistResult {
  batchId: string;
  created: number;
  updated: number;
}

/** Writes one file's lines in a single transaction. Re-importing updates lines by business key. */
export async function persistImport(db: Db, args: PersistArgs): Promise<PersistResult> {
  const { preview } = args;
  return db.$transaction(
    async (tx) => {
      const batch = await tx.importBatch.create({
        data: {
          reportProgramId: args.reportProgramId ?? null,
          programId: preview.programId,
          fileName: args.fileName,
          sha256: args.sha256,
          exportKind: preview.exportKind,
          source: args.source,
          rowCount: preview.lines.length,
          receivedMonth: args.receivedMonth ?? null,
          warnings: preview.warnings,
          importedById: args.importedById ?? null,
        },
      });

      if (preview.summary.length) {
        await tx.spmSummaryRow.createMany({ data: preview.summary.map((s) => ({ ...s, batchId: batch.id })) });
      }

      // PO records: create missing ones, then touch lastSeenAt on all
      const poInfo = new Map<string, NonNullable<MappedLine["po"]>>();
      for (const line of preview.lines) if (line.po && !poInfo.has(line.po.poNumber)) poInfo.set(line.po.poNumber, line.po);
      const poNumbers = [...poInfo.keys()];
      if (poNumbers.length) {
        await tx.poRecord.createMany({ data: [...poInfo.values()], skipDuplicates: true });
        await tx.poRecord.updateMany({ where: { poNumber: { in: poNumbers } }, data: { lastSeenAt: new Date() } });
      }
      const poIds = new Map(
        (await tx.poRecord.findMany({ where: { poNumber: { in: poNumbers } }, select: { id: true, poNumber: true } })).map((p) => [p.poNumber, p.id]),
      );

      const existing = await tx.complianceLine.findMany({
        where: { OR: groupKeys(preview.lines).map(([metricId, keys]) => ({ metricId, lineKey: { in: keys } })) },
        select: { id: true, metricId: true, lineKey: true },
      });
      const existingIds = new Map(existing.map((l) => [`${l.metricId}|${l.lineKey}`, l.id]));

      const toCreate: Prisma.ComplianceLineCreateManyInput[] = [];
      let updated = 0;
      for (const line of preview.lines) {
        const data = lineData(line, batch.id, line.po ? (poIds.get(line.po.poNumber) ?? null) : null);
        const id = existingIds.get(`${line.metricId}|${line.lineKey}`);
        if (id) {
          await tx.complianceLine.update({ where: { id }, data });
          updated += 1;
        } else {
          // A line keeps the month it was first received; later exports only update it
          toCreate.push({ ...data, metricId: line.metricId, lineKey: line.lineKey, receivedMonth: receivedMonthFor(line.fiscalMonth, args.receivedMonth) });
        }
      }
      for (let i = 0; i < toCreate.length; i += 1000) {
        await tx.complianceLine.createMany({ data: toCreate.slice(i, i + 1000) });
      }

      // A later SPM export can carry THD's Approve/Deny decision for a submitted dispute.
      // Flag it on the dispute; the outcome itself is recorded by a person.
      const decided = await tx.complianceLine.findMany({
        where: { batchId: batch.id, spmDecision: { not: null }, dispute: { status: "SUBMITTED" } },
        select: { spmDecision: true, spmDecisionDetail: true, dispute: { select: { id: true, spmDecisionSeen: true } } },
      });
      for (const line of decided) {
        if (!line.dispute || line.dispute.spmDecisionSeen === line.spmDecision) continue;
        await tx.dispute.update({
          where: { id: line.dispute.id },
          data: {
            spmDecisionSeen: line.spmDecision,
            events: {
              create: {
                type: "SPM_UPDATE",
                body: `SPM export "${args.fileName}" shows THD decision: ${line.spmDecision}${line.spmDecisionDetail ? ` (${line.spmDecisionDetail})` : ""}`,
                userId: args.importedById ?? null,
              },
            },
          },
        });
      }

      await tx.importBatch.update({ where: { id: batch.id }, data: { createdCount: toCreate.length, updatedCount: updated } });
      if (args.reportProgramId) {
        await tx.reportProgram.update({ where: { id: args.reportProgramId }, data: { status: "IMPORTED" } });
      }
      return { batchId: batch.id, created: toCreate.length, updated };
    },
    { timeout: 300_000, maxWait: 30_000 },
  );
}

function groupKeys(lines: MappedLine[]): [string, string[]][] {
  const byMetric = new Map<string, string[]>();
  for (const l of lines) {
    const keys = byMetric.get(l.metricId) ?? [];
    keys.push(l.lineKey);
    byMetric.set(l.metricId, keys);
  }
  return [...byMetric.entries()];
}

/**
 * Sets the received month on lines from a file imported before received months were recorded.
 * `claimed` holds lines already given a month in this run, so the earliest folder wins.
 */
export async function recordReceivedMonth(db: Db, args: { preview: ImportPreview; sha256: string; receivedMonth: number; claimed: Set<string> }): Promise<number> {
  const keys = args.preview.lines.map((l) => `${l.metricId}|${l.lineKey}`).filter((k) => !args.claimed.has(k));
  for (const k of keys) args.claimed.add(k);
  let updated = 0;
  for (const [metricId, lineKeys] of groupKeys(args.preview.lines.filter((l) => keys.includes(`${l.metricId}|${l.lineKey}`)))) {
    updated += await db.$executeRaw`
      UPDATE "ComplianceLine" SET "receivedMonth" = GREATEST(${args.receivedMonth}::int, "fiscalMonth")
      WHERE "metricId" = ${metricId} AND "lineKey" IN (${Prisma.join(lineKeys)})`;
  }
  await db.importBatch.updateMany({ where: { sha256: args.sha256, receivedMonth: null }, data: { receivedMonth: args.receivedMonth } });
  return updated;
}
