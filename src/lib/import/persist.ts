import { createHash } from "node:crypto";
import { Prisma, type DataPeriod, type PrismaClient } from "@prisma/client";
import { ImportError, parseWorkbook } from "./parse";
import { detectProgram, SUMMARY_SHEET, transformWorkbook, type ConfigAlias, type ConfigProgram, type ImportPreview, type MappedLine } from "./transform";

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
  /** The report's compliance period the file is for (see TransformOptions.period) */
  period?: DataPeriod;
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
    period: args.period,
  });
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
  /** The report's compliance period the file was imported for */
  period?: DataPeriod;
}

export interface PersistResult {
  batchId: string;
  created: number;
  updated: number;
  /** Update-only lines (the other period's sheets) that matched nothing, so were not added */
  skipped: number;
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
          period: args.period ?? "OTHER",
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

      const reconciled = await reconcileSummaryLines(tx, preview.lines);
      const existing = await tx.complianceLine.findMany({
        where: { OR: groupKeys(reconciled).map(([metricId, keys]) => ({ metricId, lineKey: { in: keys } })) },
        select: { id: true, metricId: true, lineKey: true },
      });
      const existingIds = new Map(existing.map((l) => [`${l.metricId}|${l.lineKey}`, l.id]));
      // Sheets for the report's other period only refresh lines that are already there
      const lines = reconciled.filter((l) => !l.updateOnly || existingIds.has(`${l.metricId}|${l.lineKey}`));
      const skipped = reconciled.length - lines.length;

      // PO records: create missing ones, then touch lastSeenAt on all
      const poInfo = new Map<string, NonNullable<MappedLine["po"]>>();
      for (const line of lines) if (line.po && !poInfo.has(line.po.poNumber)) poInfo.set(line.po.poNumber, line.po);
      const poNumbers = [...poInfo.keys()];
      if (poNumbers.length) {
        await tx.poRecord.createMany({ data: [...poInfo.values()], skipDuplicates: true });
        await tx.poRecord.updateMany({ where: { poNumber: { in: poNumbers } }, data: { lastSeenAt: new Date() } });
      }
      const poIds = new Map(
        (await tx.poRecord.findMany({ where: { poNumber: { in: poNumbers } }, select: { id: true, poNumber: true } })).map((p) => [p.poNumber, p.id]),
      );


      const toCreate: Prisma.ComplianceLineCreateManyInput[] = [];
      let updated = 0;
      for (const line of lines) {
        const data = lineData(line, batch.id, line.po ? (poIds.get(line.po.poNumber) ?? null) : null);
        const id = existingIds.get(`${line.metricId}|${line.lineKey}`);
        if (id) {
          await tx.complianceLine.update({ where: { id }, data });
          updated += 1;
        } else {
          // A line keeps the month it was first received; later exports only update it
          toCreate.push({ ...data, createdBatchId: batch.id, metricId: line.metricId, lineKey: line.lineKey, receivedMonth: receivedMonthFor(line.fiscalMonth, args.receivedMonth) });
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
      return { batchId: batch.id, created: toCreate.length, updated, skipped };
    },
    { timeout: 300_000, maxWait: 30_000 },
  );
}

/**
 * Lines from a summary-only export stand in for a metric and month until its detail arrives:
 * detail lines delete them (with any review), and they are skipped where detail already exists.
 */
async function reconcileSummaryLines(tx: Prisma.TransactionClient, lines: MappedLine[]): Promise<MappedLine[]> {
  const pairs = (summary: boolean) => [
    ...new Map(lines.filter((l) => !l.updateOnly && (l.sourceSheet === SUMMARY_SHEET) === summary).map((l) => [`${l.metricId}|${l.fiscalMonth}`, { metricId: l.metricId, fiscalMonth: l.fiscalMonth }])).values(),
  ];
  const detail = pairs(false);
  if (detail.length) {
    await tx.complianceLine.deleteMany({ where: { sourceSheet: SUMMARY_SHEET, OR: detail } });
  }
  const summary = pairs(true);
  if (!summary.length) return lines;
  const covered = await tx.complianceLine.findMany({
    where: { sourceSheet: { not: SUMMARY_SHEET }, OR: summary },
    distinct: ["metricId", "fiscalMonth"],
    select: { metricId: true, fiscalMonth: true },
  });
  const skip = new Set(covered.map((c) => `${c.metricId}|${c.fiscalMonth}`));
  return lines.filter((l) => l.sourceSheet !== SUMMARY_SHEET || !skip.has(`${l.metricId}|${l.fiscalMonth}`));
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
