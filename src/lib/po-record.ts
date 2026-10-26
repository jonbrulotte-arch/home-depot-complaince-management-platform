import { prisma } from "@/lib/prisma";
import { getPeriodField, periodOf } from "@/lib/periods";

// Everything known about one PO record (one use of a PO number, see src/lib/po.ts): its lines
// across programs and months, where each came from, how it was reviewed and disputed, warehouse
// feedback, the reports it appears in, and the other uses of the same PO number.

export async function getPoRecord(id: string) {
  const record = await prisma.poRecord.findUnique({
    where: { id },
    include: {
      lines: {
        include: {
          metric: { include: { program: true } },
          batch: {
            select: {
              fileName: true,
              importedAt: true,
              period: true,
              source: true,
              exportKind: true,
              importedBy: { select: { name: true } },
            },
          },
          review: { include: { reviewer: { select: { name: true } } } },
          dispute: {
            include: {
              reasonCode: { select: { code: true } },
              events: { include: { user: { select: { name: true } } }, orderBy: { at: "asc" } },
              attachments: { select: { id: true, fileName: true, size: true, uploadedAt: true }, orderBy: { uploadedAt: "asc" } },
            },
          },
          feedback: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
        },
        orderBy: [{ fiscalMonth: "asc" }, { metric: { program: { sortOrder: "asc" } } }, { metric: { sortOrder: "asc" } }, { sourceRow: "asc" }],
      },
    },
  });
  if (!record) return null;

  const [otherUses, reasonCodes, field] = await Promise.all([
    prisma.poRecord.findMany({
      where: { poNumber: record.poNumber, id: { not: id } },
      select: { id: true, poCreateDate: true, _count: { select: { lines: true } } },
      orderBy: { poCreateDate: "desc" },
    }),
    prisma.disputeReasonCode.findMany({
      where: { id: { in: record.lines.flatMap((l) => (l.review?.reasonCodeId ? [l.review.reasonCodeId] : [])) } },
      select: { id: true, code: true },
    }),
    getPeriodField(),
  ]);

  // Reports covering each line: same report period (per the period setting) and program
  const periods = [...new Set(record.lines.map((l) => periodOf(field, l)))];
  const reports = await prisma.complianceReport.findMany({
    where: { period: { fiscalMonth: { in: periods } } },
    select: { id: true, title: true, status: true, historical: true, period: { select: { fiscalMonth: true } }, programs: { select: { programId: true } } },
  });
  const reportsFor = (line: (typeof record.lines)[number]) =>
    reports.filter((r) => r.period.fiscalMonth === periodOf(field, line) && r.programs.some((p) => p.programId === line.metric.programId));

  return { record, otherUses, reasonCode: new Map(reasonCodes.map((c) => [c.id, c.code])), reportsFor };
}

export type PoRecordView = NonNullable<Awaited<ReturnType<typeof getPoRecord>>>;
