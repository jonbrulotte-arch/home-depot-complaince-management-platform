import { prisma } from "@/lib/prisma";
import { ISSUE_STATUSES, poNumberVariants, resolveIssuePo } from "@/lib/issues";

// Issue Log reads that need the database: an issue with its POs tied to compliance data, and the
// issues tied to given PO records (for the PO record page and the violation review).


const recordSelect = { id: true, poNumber: true, poCreateDate: true } as const;
type RecordRef = { id: string; poNumber: string; poCreateDate: Date | null };

/** For each issue PO, the PO record it means (see resolveIssuePo), or null when the data has none yet. */
export async function matchIssuePos(items: { poNumber: string; poCreateDate: Date | null; issueDate: Date }[]): Promise<(RecordRef | null)[]> {
  const variants = [...new Set(items.flatMap((i) => poNumberVariants(i.poNumber)))];
  if (!variants.length) return items.map(() => null);
  const records = await prisma.poRecord.findMany({ where: { poNumber: { in: variants } }, select: recordSelect });
  return items.map((i) => {
    const names = poNumberVariants(i.poNumber);
    return resolveIssuePo(
      records.filter((r) => names.includes(r.poNumber)),
      i.poCreateDate,
      i.issueDate,
    );
  });
}

/** One issue with its POs, each tied to its PO record and that record's compliance lines when imported. */
export async function getIssue(id: string) {
  const issue = await prisma.issue.findUnique({
    where: { id },
    include: {
      program: { select: { name: true } },
      createdBy: { select: { name: true } },
      updatedBy: { select: { name: true } },
      pos: { orderBy: { poNumber: "asc" } },
      notes: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      attachments: { select: { id: true, fileName: true, size: true, createdAt: true, uploadedBy: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!issue) return null;
  const matched = await matchIssuePos(issue.pos.map((p) => ({ ...p, issueDate: issue.issueDate })));
  const recordIds = [...new Set(matched.flatMap((m) => (m ? [m.id] : [])))];
  const lines = recordIds.length
    ? await prisma.complianceLine.findMany({
        where: { poRecordId: { in: recordIds } },
        select: {
          id: true,
          poRecordId: true,
          fiscalMonth: true,
          receivedMonth: true,
          isCompliant: true,
          offsetAmount: true,
          metric: { select: { name: true, program: { select: { name: true } } } },
          review: { select: { disposition: true, teamInfluence: true, rootCause: true } },
          dispute: { select: { status: true, amountRecovered: true } },
        },
        orderBy: [{ fiscalMonth: "asc" }, { metric: { sortOrder: "asc" } }],
      })
    : [];
  return {
    issue,
    pos: issue.pos.map((p, i) => ({ ...p, record: matched[i], lines: matched[i] ? lines.filter((l) => l.poRecordId === matched[i]!.id) : [] })),
  };
}

export type IssueSummary = { id: string; number: number; title: string; issueDate: Date; status: keyof typeof ISSUE_STATUSES; category: string; hdTicket: string | null };

/** Issues tied to each of these PO records (by number, and by create date or issue date for reused numbers). */
export async function issuesForPoRecords(recordIds: string[]): Promise<Map<string, IssueSummary[]>> {
  const out = new Map<string, IssueSummary[]>();
  if (!recordIds.length) return out;
  const records = await prisma.poRecord.findMany({ where: { id: { in: recordIds } }, select: { poNumber: true } });
  const variants = [...new Set(records.flatMap((r) => poNumberVariants(r.poNumber)))];
  const issuePos = await prisma.issuePo.findMany({
    where: { poNumber: { in: variants } },
    include: { issue: { select: { id: true, number: true, title: true, issueDate: true, status: true, category: true, hdTicket: true } } },
  });
  const matched = await matchIssuePos(issuePos.map((p) => ({ poNumber: p.poNumber, poCreateDate: p.poCreateDate, issueDate: p.issue.issueDate })));
  issuePos.forEach((p, i) => {
    const record = matched[i];
    if (!record || !recordIds.includes(record.id)) return;
    const list = out.get(record.id) ?? [];
    if (!list.some((x) => x.id === p.issue.id)) list.push(p.issue);
    out.set(record.id, list.sort((a, b) => b.issueDate.getTime() - a.issueDate.getTime()));
  });
  return out;
}

/** Issues by status, and how many happened in the last 30 days, for the Issue Log's tiles. */
export async function issueCounts() {
  const [byStatus, recent] = await Promise.all([
    prisma.issue.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.issue.count({ where: { issueDate: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
  ]);
  return { count: (s: keyof typeof ISSUE_STATUSES) => byStatus.find((b) => b.status === s)?._count._all ?? 0, recent };
}
