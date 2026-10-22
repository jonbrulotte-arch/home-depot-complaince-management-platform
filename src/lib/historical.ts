import type { Prisma, PrismaClient } from "@prisma/client";
import { fiscalLabel, shiftFiscalMonth } from "@/lib/fiscal";
import { isApprovedDecision, isDeniedDecision } from "@/lib/disputes";
import { buildScorecard } from "@/lib/scorecard";
import { getShipmentInputs } from "@/lib/shipments";
import { getPeriodField, linesInPeriod, type PeriodField } from "@/lib/periods";

// Historical reports turn months loaded from the SPM archive into reviewed, published reports
// so their scorecards exist. Violations are accepted as THD reported them; dispute results come
// from the exports (per-line Approve/Deny values and THD's summary post-dispute totals).

/** Months this close to the newest data may still be in THD's dispute window, so are left for the normal workflow. */
export const RECENT_MONTHS_EXCLUDED = 2;
const HISTORICAL_NOTE = "Historical import: accepted as reported by THD; not reviewed in this platform.";

export interface HistoricalMonth {
  fiscalMonth: number;
  label: string;
  programs: { id: string; name: string; lines: number; violations: number }[];
}

export interface HistoricalPlan {
  months: HistoricalMonth[];
  /** Months skipped because a report already covers them */
  existing: number[];
  latest: number | null;
  to: number | null;
}

/** Months with imported data and no report yet, up to `to` (default: all but the newest two months). */
export async function planHistoricalReports(
  db: PrismaClient,
  opts: { from?: number; to?: number; rebuild?: boolean } = {},
): Promise<HistoricalPlan> {
  const field = await getPeriodField();
  const max = await db.complianceLine.aggregate({ _max: { fiscalMonth: true, receivedMonth: true } });
  const latest = max._max[field];
  if (!latest) return { months: [], existing: [], latest: null, to: null };
  const to = opts.to ?? shiftFiscalMonth(latest, -RECENT_MONTHS_EXCLUDED);
  const where = linesInPeriod(field, { gte: opts.from ?? 0, lte: to });

  const [rawGroups, metrics, programs, reported] = await Promise.all([
    db.complianceLine.groupBy({ by: [field, "metricId", "isCompliant"], where, _count: { _all: true } }),
    db.metric.findMany({ select: { id: true, programId: true } }),
    db.program.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    // When rebuilding, existing historical reports will be replaced, so only other reports block a month
    db.compliancePeriod.findMany({ where: { reports: { some: opts.rebuild ? { historical: false } : {} } }, select: { fiscalMonth: true } }),
  ]);
  const groups = rawGroups.map((g) => ({ ...g, fiscalMonth: (g as unknown as Record<PeriodField, number>)[field] }));
  const programOf = new Map(metrics.map((m) => [m.id, m.programId]));
  const existing = new Set(reported.map((p) => p.fiscalMonth));

  const months = [...new Set(groups.map((g) => g.fiscalMonth))]
    .filter((fm) => fm > 0)
    .sort((a, b) => a - b)
    .map((fiscalMonth) => ({
      fiscalMonth,
      label: fiscalLabel(fiscalMonth),
      programs: programs
        .map((p) => {
          const rows = groups.filter((g) => g.fiscalMonth === fiscalMonth && programOf.get(g.metricId) === p.id);
          return {
            id: p.id,
            name: p.name,
            lines: rows.reduce((s, g) => s + g._count._all, 0),
            violations: rows.filter((g) => !g.isCompliant).reduce((s, g) => s + g._count._all, 0),
          };
        })
        .filter((p) => p.lines > 0),
    }));
  return {
    months: months.filter((m) => !existing.has(m.fiscalMonth)),
    existing: months.filter((m) => existing.has(m.fiscalMonth)).map((m) => m.fiscalMonth),
    latest,
    to,
  };
}

/**
 * Deletes historical reports with their scorecards and shipment counts, so they can be recreated
 * (e.g. after changing how reports are grouped). Line reviews and disputes are kept and reused.
 */
export async function deleteHistoricalReports(db: PrismaClient): Promise<number> {
  const res = await db.complianceReport.deleteMany({ where: { historical: true } });
  return res.count;
}

export interface HistoricalResult {
  fiscalMonth: number;
  reportId: string;
  violations: number;
  disputes: number;
  preOffset: number;
  postOffset: number;
}

/** Creates one published historical report for a month from the plan. */
export async function createHistoricalReport(db: PrismaClient, month: HistoricalMonth, userId: string | null): Promise<HistoricalResult> {
  const { fiscalMonth } = month;
  const programIds = month.programs.map((p) => p.id);
  const inPeriod = linesInPeriod(await getPeriodField(), fiscalMonth);

  const report = await db.$transaction(async (tx) => {
    const period = await tx.compliancePeriod.upsert({ where: { fiscalMonth }, update: {}, create: { fiscalMonth, label: month.label } });
    const created = await tx.complianceReport.create({
      data: {
        periodId: period.id,
        title: `${month.label} Compliance Report (historical)`,
        notes: "Created from the historical SPM archive. Violations were accepted as reported by THD; dispute results come from THD's exports.",
        historical: true,
        createdById: userId,
        programs: { create: programIds.map((programId) => ({ programId, status: "REVIEWED" as const })) },
      },
    });

    const lines = await tx.complianceLine.findMany({
      where: { ...inPeriod, isCompliant: false, metric: { programId: { in: programIds } } },
      select: { id: true, offsetAmount: true, spmDecision: true, spmDecisionDetail: true, review: { select: { id: true } }, dispute: { select: { id: true } } },
    });
    const now = new Date();
    const reviews: Prisma.LineReviewCreateManyInput[] = [];
    for (const line of lines) {
      const approved = isApprovedDecision(line.spmDecision);
      const denied = isDeniedDecision(line.spmDecision);
      if (!line.review) {
        reviews.push({
          lineId: line.id,
          disposition: approved || denied ? "DISPUTABLE" : "ACCEPTED",
          notes: HISTORICAL_NOTE,
          reviewerId: userId,
          reviewedAt: now,
        });
      }
      // Per-line THD decisions in the exports become decided disputes
      if ((approved || denied) && !line.dispute) {
        await tx.dispute.create({
          data: {
            lineId: line.id,
            status: approved ? "APPROVED" : "DENIED",
            amountDisputed: line.offsetAmount,
            amountRecovered: approved ? line.offsetAmount : 0,
            checklist: [],
            decidedAt: now,
            decisionCode: line.spmDecision,
            decisionNotes: line.spmDecisionDetail,
            events: { create: { type: "CREATED", body: `Recorded from THD's SPM export (${line.spmDecision})`, toStatus: approved ? "APPROVED" : "DENIED", userId } },
          },
        });
      }
    }
    if (reviews.length) await tx.lineReview.createMany({ data: reviews });
    return created;
  });

  // Drop Ship shipment counts can be filled from THD's Parcel flag; RDC/DFC need people
  const shipments = await getShipmentInputs(report.id);
  for (const s of shipments) {
    for (const mode of ["SMALL_PARCEL", "LTL_TL"] as const) {
      const count = s.suggested[mode];
      if (count === undefined || s.counts[mode] !== null) continue;
      await db.shipmentCount.create({ data: { reportId: report.id, programId: s.programId, mode, count, updatedById: userId } });
    }
  }

  const data = await buildScorecard(report.id);
  await db.$transaction([
    db.scorecard.create({
      data: { reportId: report.id, data: data as unknown as Prisma.InputJsonObject, generatedById: userId, publishedAt: new Date(), publishedById: userId },
    }),
    db.complianceReport.update({ where: { id: report.id }, data: { status: "PUBLISHED" } }),
  ]);
  return {
    fiscalMonth,
    reportId: report.id,
    violations: data.totals.violations,
    disputes: data.programs.reduce((s, p) => s + p.metrics.reduce((t, m) => t + m.disputed, 0), 0),
    preOffset: data.totals.preOffset,
    postOffset: data.totals.postOffset,
  };
}
