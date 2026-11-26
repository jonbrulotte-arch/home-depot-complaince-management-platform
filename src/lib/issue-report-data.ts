import { prisma } from "@/lib/prisma";
import { fiscalLabel } from "@/lib/fiscal";
import { matchIssuePos } from "@/lib/issues-data";
import { teamNames } from "@/lib/teams";
import { buildIssueReport, type ReportIssue, type ReportRange } from "@/lib/issue-report";

// Loads the Summarizer's Issues report (built in issue-report.ts): the issues dated in the range,
// and earlier issues logged, updated or resolved in it, each with the violations on its POs.

export async function loadIssueReport(range: ReportRange) {
  const during = { gte: range.start, lt: range.end };
  const [issues, names] = await Promise.all([
    prisma.issue.findMany({
      where: { OR: [{ issueDate: during }, { createdAt: during }, { resolvedAt: during }, { notes: { some: { createdAt: during } } }] },
      include: {
        program: { select: { name: true } },
        createdBy: { select: { name: true } },
        pos: { orderBy: { poNumber: "asc" } },
        notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      },
    }),
    teamNames(),
  ]);
  const teamName = (key: string | null | undefined) => (key ? (names[key] ?? key) : null);

  // Tie each issue PO to its PO record, then load the violations on those records
  const items = issues.flatMap((i) => i.pos.map((p) => ({ issueId: i.id, poNumber: p.poNumber, poCreateDate: p.poCreateDate, issueDate: i.issueDate })));
  const matched = await matchIssuePos(items);
  const recordIds = [...new Set(matched.flatMap((m) => (m ? [m.id] : [])))];
  const lines = recordIds.length
    ? await prisma.complianceLine.findMany({
        where: { poRecordId: { in: recordIds }, isCompliant: false, NOT: { review: { disposition: "RESOLVED" } } },
        select: {
          poRecordId: true,
          fiscalMonth: true,
          receivedMonth: true,
          offsetAmount: true,
          metric: { select: { name: true, program: { select: { name: true } } } },
          review: { select: { teamInfluence: true } },
          dispute: { select: { status: true, amountRecovered: true } },
        },
        orderBy: [{ fiscalMonth: "asc" }, { metric: { sortOrder: "asc" } }],
      })
    : [];

  let n = 0;
  const all: ReportIssue[] = issues.map((i) => ({
    id: i.id,
    number: i.number,
    title: i.title,
    issueDate: i.issueDate,
    status: i.status,
    severity: i.severity,
    category: i.category,
    team: teamName(i.team),
    program: i.program?.name ?? null,
    hdTickets: i.hdTickets,
    description: i.description,
    actionsTaken: i.actionsTaken,
    consequences: i.consequences,
    resolution: i.resolution,
    estimatedFine: i.estimatedFine,
    followUpDate: i.followUpDate,
    resolvedAt: i.resolvedAt,
    createdAt: i.createdAt,
    createdBy: i.createdBy?.name ?? null,
    pos: i.pos.map((p) => {
      const record = matched[n++];
      return {
        poNumber: p.poNumber,
        estimatedFine: p.estimatedFine,
        found: Boolean(record),
        violations: record
          ? lines
              .filter((l) => l.poRecordId === record.id)
              .map((l) => ({
                month: fiscalLabel(l.receivedMonth ?? l.fiscalMonth),
                program: l.metric.program.name,
                metric: l.metric.name,
                offset: Number(l.offsetAmount),
                team: teamName(l.review?.teamInfluence),
                disputeStatus: l.dispute?.status ?? null,
                recovered: Number(l.dispute?.amountRecovered ?? 0),
              }))
          : [],
      };
    }),
    notes: i.notes.map((note) => ({ author: note.author?.name ?? null, createdAt: note.createdAt, body: note.body })),
  }));
  return buildIssueReport(all, range);
}
