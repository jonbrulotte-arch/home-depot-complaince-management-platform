import { prisma } from "@/lib/prisma";
import { calendarToFiscal } from "@/lib/fiscal";
import { getPeriodField, linesInPeriod, periodOf } from "@/lib/periods";
import { matchIssuePos } from "@/lib/issues-data";
import { scorecardData } from "@/lib/scorecard-store";
import { previousFrame, priorYearFrame, resolveTimeFrame, type GoalSnapshot, type InsightIssue, type InsightLine, type TimeFrame } from "@/lib/insights";

// Loads what Reports & Insights counts (src/lib/insights.ts does the counting): the compliance
// lines of the time frame (and of the frames it is compared with), published scorecards, and the
// Issue Log with the violations on each issue's POs.

export interface InsightFilters {
  range?: string;
  from?: string;
  to?: string;
  program?: string;
}

/** The fiscal month a calendar date falls in (issue dates are stored as UTC dates). */
export const fiscalMonthOf = (d: Date) => calendarToFiscal(d.getUTCFullYear(), d.getUTCMonth());

export async function loadInsights(filters: InsightFilters) {
  const field = await getPeriodField();
  const programs = await prisma.program.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { code: true, name: true } });
  const programCode = programs.some((p) => p.code === filters.program) ? filters.program : undefined;
  const programWhere = programCode ? { metric: { program: { code: programCode } } } : {};

  const bounds = await prisma.complianceLine.aggregate({ _min: { [field]: true }, _max: { [field]: true } });
  const latest = (bounds._max as Record<string, number | null>)[field] ?? null;
  const earliest = (bounds._min as Record<string, number | null>)[field] ?? null;
  const frame = resolveTimeFrame(filters.range, latest, earliest, { from: filters.from, to: filters.to });
  const prev = previousFrame(frame);
  const prior = priorYearFrame(frame);
  const loadFrom = Math.min(frame.from, prev?.from ?? frame.from, prior?.from ?? frame.from);

  const [rows, snapshots, issues] = await Promise.all([
    frame.months.length
      ? prisma.complianceLine.findMany({
          where: { ...linesInPeriod(field, { gte: loadFrom, lte: frame.to }), ...programWhere },
          select: {
            id: true,
            fiscalMonth: true,
            receivedMonth: true,
            isCompliant: true,
            offsetAmount: true,
            dcNumber: true,
            carrierUsed: true,
            sku: true,
            skuDescription: true,
            poRecordId: true,
            poRecord: { select: { poNumber: true } },
            metric: { select: { code: true, name: true, program: { select: { code: true, name: true } } } },
            review: { select: { disposition: true, teamInfluence: true, rootCause: true } },
            dispute: { select: { status: true, amountDisputed: true, amountRecovered: true, submittedAt: true, decidedAt: true, reasonCode: { select: { code: true } } } },
            _count: { select: { feedback: true } },
          },
        })
      : Promise.resolve([]),
    prisma.scorecard.findMany({ where: { publishedAt: { not: null }, report: { status: "PUBLISHED" } }, select: { data: true } }),
    loadIssues(programCode),
  ]);

  const lines: InsightLine[] = rows.map((r) => ({
    id: r.id,
    month: periodOf(field, r),
    programCode: r.metric.program.code,
    programName: r.metric.program.name,
    metricCode: r.metric.code,
    metricName: r.metric.name,
    isCompliant: r.isCompliant,
    offset: Number(r.offsetAmount),
    disposition: r.review?.disposition ?? null,
    team: r.review?.teamInfluence ?? null,
    rootCause: r.review?.rootCause ?? null,
    dcNumber: r.dcNumber,
    carrier: r.carrierUsed?.trim() || null,
    sku: r.sku,
    skuDescription: r.skuDescription,
    poNumber: r.poRecord?.poNumber ?? null,
    poRecordId: r.poRecordId,
    dispute: r.dispute
      ? {
          status: r.dispute.status,
          disputed: Number(r.dispute.amountDisputed),
          recovered: r.dispute.amountRecovered === null ? null : Number(r.dispute.amountRecovered),
          reasonCode: r.dispute.reasonCode?.code ?? null,
          submittedAt: r.dispute.submittedAt,
          decidedAt: r.dispute.decidedAt,
        }
      : null,
    hasFeedback: r._count.feedback > 0,
  }));
  const within = (l: InsightLine, f: { from: number; to: number } | null) => Boolean(f && l.month >= f.from && l.month <= f.to);

  const goalSnapshots: GoalSnapshot[] = snapshots.map((s) => {
    const d = scorecardData(s.data);
    return {
      month: d.fiscalMonth,
      programs: d.programs.map((p) => ({
        code: p.code,
        name: p.name,
        metrics: p.metrics.map((m) => ({ code: m.code, name: m.name, goalPct: m.goalPct, prePct: m.prePct, postPct: m.postPct, meetsGoal: m.meetsGoal, postOffset: m.postOffset })),
      })),
    };
  });

  return {
    field,
    frame,
    /** First and last months with data, for the custom range */
    earliest,
    latest,
    programs,
    programCode,
    lines: lines.filter((l) => within(l, frame)),
    previous: prev ? { ...prev, lines: lines.filter((l) => within(l, prev)) } : null,
    priorYear: prior ? { ...prior, lines: lines.filter((l) => within(l, prior)) } : null,
    goalSnapshots,
    issues,
  };
}

/** Every issue (optionally for one program), with the violations and offsets on its POs. */
async function loadIssues(programCode: string | undefined): Promise<InsightIssue[]> {
  const issues = await prisma.issue.findMany({
    where: programCode ? { program: { code: programCode } } : {},
    select: {
      id: true,
      number: true,
      title: true,
      issueDate: true,
      status: true,
      severity: true,
      category: true,
      team: true,
      createdAt: true,
      resolvedAt: true,
      followUpDate: true,
      program: { select: { code: true } },
      pos: { select: { poNumber: true, poCreateDate: true } },
    },
  });
  const items = issues.flatMap((i) => i.pos.map((p) => ({ issueId: i.id, poNumber: p.poNumber, poCreateDate: p.poCreateDate, issueDate: i.issueDate })));
  const matched = await matchIssuePos(items);
  const recordIds = [...new Set(matched.flatMap((m) => (m ? [m.id] : [])))];
  const violations = recordIds.length
    ? await prisma.complianceLine.findMany({
        where: { poRecordId: { in: recordIds }, isCompliant: false, NOT: { review: { disposition: "RESOLVED" } } },
        select: { poRecordId: true, offsetAmount: true },
      })
    : [];
  const perRecord = new Map<string, { count: number; offsets: number }>();
  for (const v of violations) {
    const g = perRecord.get(v.poRecordId!) ?? { count: 0, offsets: 0 };
    g.count++;
    g.offsets += Number(v.offsetAmount);
    perRecord.set(v.poRecordId!, g);
  }
  return issues.map((i) => {
    const records = new Set(items.flatMap((it, n) => (it.issueId === i.id && matched[n] ? [matched[n]!.id] : [])));
    const sums = [...records].map((id) => perRecord.get(id) ?? { count: 0, offsets: 0 });
    return {
      id: i.id,
      number: i.number,
      title: i.title,
      issueDate: i.issueDate,
      status: i.status,
      severity: i.severity,
      category: i.category,
      team: i.team,
      programCode: i.program?.code ?? null,
      createdAt: i.createdAt,
      resolvedAt: i.resolvedAt,
      followUpDate: i.followUpDate,
      poCount: i.pos.length,
      violations: sums.reduce((s, x) => s + x.count, 0),
      offsets: Math.round(sums.reduce((s, x) => s + x.offsets, 0) * 100) / 100,
    };
  });
}

export type Insights = Awaited<ReturnType<typeof loadInsights>>;
export type { TimeFrame };
