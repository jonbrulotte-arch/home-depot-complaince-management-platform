import { prisma } from "@/lib/prisma";
import { fiscalLabel, shiftFiscalMonth } from "@/lib/fiscal";
import { getPeriodField, linesInPeriod, type PeriodField } from "@/lib/periods";
import { scorecardData } from "@/lib/scorecard-store";

// Figures shared by the dashboard and the public dashboard (/d/<token>).

export interface RollingPoint {
  month: number;
  label: string;
  /** Pre-dispute offsets assessed in this month */
  monthOffset: number;
  /** Total of this month and the 11 before it */
  rolling: number;
  /** Change in the rolling total from the previous month (null for the first month) */
  change: number | null;
  /** Months of data inside the window, when fewer than 12 (the archive's first year) */
  monthsInWindow: number;
}

const round = (v: number) => Math.round(v * 100) / 100;

/** Pre-dispute offsets by program for the latest 12 months, and the 12-month total over all history. */
export async function offsetOverview() {
  const field = await getPeriodField();
  const latest = await prisma.complianceLine.aggregate({ _max: { fiscalMonth: true, receivedMonth: true } });
  const lastMonth = latest._max[field] ?? null;
  const months = lastMonth ? Array.from({ length: 12 }, (_, i) => shiftFiscalMonth(lastMonth, i - 11)) : [];

  const [programs, metrics, offsets, allMonths] = await Promise.all([
    prisma.program.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.metric.findMany({ select: { id: true, programId: true } }),
    months.length
      ? prisma.complianceLine
          .groupBy({
            by: ["metricId", field],
            where: { ...linesInPeriod(field, { gte: months[0], lte: months[11] }), isCompliant: false },
            _sum: { offsetAmount: true },
            _count: { _all: true },
          })
          .then((rows) => rows.map((g) => ({ ...g, month: (g as unknown as Record<PeriodField, number>)[field] })))
      : Promise.resolve([]),
    // Every month's offsets, for the 12-month total over the whole history
    prisma.complianceLine
      .groupBy({ by: [field], where: { isCompliant: false }, _sum: { offsetAmount: true } })
      .then((rows) => rows.map((g) => ({ month: (g as unknown as Record<PeriodField, number>)[field], offset: Number(g._sum.offsetAmount ?? 0) }))),
  ]);

  const programOf = new Map(metrics.map((m) => [m.id, m.programId]));
  const cells: Record<string, number> = {};
  for (const g of offsets) {
    const key = `${programOf.get(g.metricId)}|${g.month}`;
    cells[key] = (cells[key] ?? 0) + Number(g._sum.offsetAmount ?? 0);
  }
  const twelveMonthTotal = round(Object.values(cells).reduce((s, v) => s + v, 0));
  const lastMonthViolations = lastMonth ? offsets.filter((g) => g.month === lastMonth).reduce((s, g) => s + g._count._all, 0) : 0;

  return { field, lastMonth, months, programs, cells, twelveMonthTotal, lastMonthViolations, rolling: rollingTotals(allMonths, lastMonth) };
}

export type OffsetOverview = Awaited<ReturnType<typeof offsetOverview>>;

/** The rolling 12-month offset total for every month from the first with data to the latest. */
export function rollingTotals(months: { month: number; offset: number }[], lastMonth: number | null | undefined): RollingPoint[] {
  const first = months.filter((m) => m.month > 0).reduce((min, m) => Math.min(min, m.month), Infinity);
  if (!lastMonth || !Number.isFinite(first)) return [];
  const byMonth = new Map(months.map((m) => [m.month, m.offset]));
  const series: number[] = [];
  for (let fm = first; fm <= lastMonth; fm = shiftFiscalMonth(fm, 1)) series.push(fm);
  const offsetOf = (fm: number) => byMonth.get(fm) ?? 0;
  let previous: number | null = null;
  return series.map((fm, i) => {
    const window = series.slice(Math.max(0, i - 11), i + 1);
    const rolling = round(window.reduce((s, m) => s + offsetOf(m), 0));
    const point: RollingPoint = {
      month: fm,
      label: fiscalLabel(fm),
      monthOffset: round(offsetOf(fm)),
      rolling,
      change: previous === null ? null : round(rolling - previous),
      monthsInWindow: window.length,
    };
    previous = rolling;
    return point;
  });
}

/** Published reports, the most recent report month first. */
export async function recentPublishedReports(take = 5) {
  const reports = await prisma.complianceReport.findMany({
    where: { status: "PUBLISHED", scorecard: { publishedAt: { not: null } } },
    orderBy: [{ period: { fiscalMonth: "desc" } }, { scorecard: { publishedAt: "desc" } }],
    take,
    include: { period: true, scorecard: { select: { data: true, publishedAt: true } } },
  });
  return reports.map((r) => {
    const data = scorecardData(r.scorecard!.data);
    return {
      id: r.id,
      title: r.title,
      periodLabel: data.periodLabel,
      historical: r.historical,
      publishedAt: r.scorecard!.publishedAt!,
      violations: data.totals.violations,
      preOffset: data.totals.preOffset,
      postOffset: data.totals.postOffset,
    };
  });
}

export type PublishedReportSummary = Awaited<ReturnType<typeof recentPublishedReports>>[number];
