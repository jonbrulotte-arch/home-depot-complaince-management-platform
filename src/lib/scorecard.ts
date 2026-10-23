import type { DisputeStatus, PeriodBasis, Prisma, TeamInfluence } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPeriodField, linesInPeriod, periodOf, type PeriodField } from "@/lib/periods";
import { fiscalLabel, shiftFiscalMonth } from "@/lib/fiscal";
import { getMetricStats } from "@/lib/reports";
import { meetsGoal } from "@/lib/scorecard-rules";
import { getShipmentInputs, type ShipmentInput } from "@/lib/shipments";
import { reportShipmentRanges, type ShipmentRanges } from "@/lib/shipment-ranges";
import { TEAM_INFLUENCES } from "@/lib/line-fields";

export interface ScorecardMetric {
  code: string;
  name: string;
  goalPct: number | null;
  lines: number;
  violations: number;
  prePct: number | null;
  postPct: number | null;
  meetsGoal: boolean | null;
  preOffset: number;
  postOffset: number;
  disputed: number;
  approved: number;
  /** Post-dispute offset taken from THD's own SPM summary (historical reports) */
  thdPostDispute?: boolean;
}

export interface ScorecardProgram {
  code: string;
  name: string;
  lines: number;
  violations: number;
  preOffset: number;
  postOffset: number;
  metrics: ScorecardMetric[];
}

export interface ScorecardViolation {
  program: string;
  metric: string;
  poNumber: string | null;
  dcNumber: string | null;
  offset: number;
  disposition: string;
  teamInfluence: string | null;
  disputeStatus: DisputeStatus | null;
  reasonCode: string | null;
  recovered: number | null;
  notes: string | null;
}

export interface ScorecardShipments {
  /** Per shipping program; null where the user has not entered a count */
  programs: { code: string; name: string; smallParcel: number | null; ltl: number | null; total: number | null }[];
  totals: { smallParcel: number; ltl: number; total: number };
  /** Transportation measures the RDC and DFC LTL shipments */
  transportationLtl: number | null;
  complete: boolean;
  /** Date ranges the counts cover; absent on scorecards generated before ranges were collected */
  ranges?: ShipmentRanges;
}

export interface ScorecardData {
  title: string;
  /** Built from the historical SPM archive rather than a reviewed month */
  historical?: boolean;
  /** How lines were grouped into the period; absent on older scorecards (THD fiscal month) */
  periodBasis?: PeriodBasis;
  fiscalMonth: number;
  periodLabel: string;
  dataReceivedAt: string | null;
  generatedAt: string;
  programs: ScorecardProgram[];
  totals: {
    lines: number;
    violations: number;
    preOffset: number;
    postOffset: number;
    disputedAmount: number;
    recovered: number;
    deniedAmount: number;
    pendingAmount: number;
    pendingDisputes: number;
  };
  /** Absent on scorecards generated before shipment counts existed */
  shipments?: ScorecardShipments;
  violations: ScorecardViolation[];
  teamInfluence: { team: string; amount: number; lines: number }[];
  trend: { fiscalMonth: number; label: string; byProgram: Record<string, number>; preOffset: number; recovered: number }[];
}

const round = (n: number) => Math.round(n * 100) / 100;

const TREND_MONTHS = 12;

/** Builds the scorecard for a report from the current lines, reviews and disputes. */
export async function buildScorecard(reportId: string): Promise<ScorecardData> {
  const report = await prisma.complianceReport.findUniqueOrThrow({
    where: { id: reportId },
    include: { period: true, programs: { include: { program: true }, orderBy: { program: { sortOrder: "asc" } } } },
  });
  const fiscalMonth = report.period.fiscalMonth;
  const programIds = report.programs.map((p) => p.programId);
  const field = await getPeriodField();
  const inReport = { ...linesInPeriod(field, fiscalMonth), metric: { programId: { in: programIds } } };

  const [stats, lines, received, shipmentInputs] = await Promise.all([
    getMetricStats(programIds, fiscalMonth),
    prisma.complianceLine.findMany({
      where: { ...inReport, isCompliant: false },
      include: { metric: { include: { program: true } }, review: true, dispute: { include: { reasonCode: { select: { code: true } } } } },
      orderBy: [{ metric: { program: { sortOrder: "asc" } } }, { metric: { sortOrder: "asc" } }, { poNumber: "asc" }],
    }),
    prisma.importBatch.aggregate({ _max: { importedAt: true }, where: { lines: { some: inReport } } }),
    getShipmentInputs(reportId),
  ]);
  const shipments = { ...summarizeShipments(shipmentInputs), ranges: reportShipmentRanges(report) };
  const thdPost = report.historical ? await thdPostDisputeOffsets(stats.map((m) => m.metricId), linesInPeriod(field, fiscalMonth)) : new Map<string, ThdSummary>();
  let thdRecovered = 0;

  const programs: ScorecardProgram[] = report.programs.map(({ program }) => {
    const metrics = stats
      .filter((m) => m.programId === program.id)
      .map((m) => {
        // For past months, THD's summary already reflects disputes decided outside this platform.
        // Use it only when THD's pre-dispute total matches the imported lines.
        const thd = thdPost.get(m.metricId);
        const useThd = thd !== undefined && Math.abs(thd.pre - m.offset) < 0.01 && thd.post < m.postDisputeOffset - 0.005;
        if (useThd) thdRecovered += m.postDisputeOffset - thd.post;
        const postOffset = useThd ? thd.post : m.postDisputeOffset;
        return {
          code: m.code,
          name: m.name,
          goalPct: m.thresholdPct,
          lines: m.total,
          violations: m.nonCompliant,
          prePct: m.compliancePct,
          postPct: m.postDisputePct,
          // THD charges only while a metric misses its goal, so a $0 post-dispute offset means it met it
          meetsGoal: useThd ? (m.thresholdPct == null ? null : postOffset === 0) : meetsGoal(m),
          preOffset: m.offset,
          postOffset,
          disputed: m.disputed + (useThd ? thd.approved + thd.denied : 0),
          approved: m.approved + (useThd ? thd.approved : 0),
          ...(useThd ? { thdPostDispute: true } : {}),
        };
      });
    const shipped = shipments.programs.find((p) => p.code === program.code)?.total;
    return {
      code: program.code,
      name: program.name,
      // Entered shipment totals beat line counts, which count PO lines rather than shipments
      lines: (program.code === "US_TRANS" ? shipments.transportationLtl : shipped) ?? Math.max(0, ...metrics.map((m) => m.lines)),
      violations: metrics.reduce((s, m) => s + m.violations, 0),
      preOffset: round(metrics.reduce((s, m) => s + m.preOffset, 0)),
      postOffset: round(metrics.reduce((s, m) => s + m.postOffset, 0)),
      metrics,
    };
  });

  const violations: ScorecardViolation[] = lines.map((l) => ({
    program: l.metric.program.name,
    metric: l.metric.name,
    poNumber: l.poNumber,
    dcNumber: l.dcNumber,
    offset: Number(l.offsetAmount),
    disposition: l.review?.disposition ?? "PENDING",
    teamInfluence: l.review?.teamInfluence ? TEAM_INFLUENCES[l.review.teamInfluence] : null,
    disputeStatus: l.dispute && l.dispute.status !== "WITHDRAWN" ? l.dispute.status : null,
    reasonCode: l.dispute?.reasonCode?.code ?? null,
    recovered: l.dispute?.amountRecovered == null ? null : Number(l.dispute.amountRecovered),
    notes: l.review?.notes ?? null,
  }));

  const activeDisputes = lines.flatMap((l) => (l.dispute && l.dispute.status !== "WITHDRAWN" ? [l.dispute] : []));
  const sumDisputes = (statuses: DisputeStatus[], field: "amountDisputed" | "amountRecovered") =>
    round(activeDisputes.filter((d) => statuses.includes(d.status)).reduce((s, d) => s + Number(d[field] ?? 0), 0));

  const byTeam = new Map<string, { amount: number; lines: number }>();
  for (const l of lines) {
    const team = l.review?.teamInfluence ? TEAM_INFLUENCES[l.review.teamInfluence as TeamInfluence] : "Not assigned";
    const entry = byTeam.get(team) ?? { amount: 0, lines: 0 };
    entry.amount += Number(l.offsetAmount);
    entry.lines += 1;
    byTeam.set(team, entry);
  }

  return {
    title: report.title,
    ...(report.historical ? { historical: true } : {}),
    periodBasis: field === "receivedMonth" ? "RECEIVED_MONTH" : "FISCAL_MONTH",
    fiscalMonth,
    periodLabel: fiscalLabel(fiscalMonth),
    dataReceivedAt: received._max.importedAt?.toISOString() ?? null,
    generatedAt: new Date().toISOString(),
    programs,
    totals: {
      lines: programs.reduce((s, p) => s + p.lines, 0),
      violations: lines.length,
      preOffset: round(programs.reduce((s, p) => s + p.preOffset, 0)),
      postOffset: round(programs.reduce((s, p) => s + p.postOffset, 0)),
      disputedAmount: sumDisputes(["PREPARING", "READY", "SUBMITTED", "APPROVED", "PARTIAL", "DENIED"], "amountDisputed"),
      recovered: round(sumDisputes(["APPROVED", "PARTIAL"], "amountRecovered") + thdRecovered),
      deniedAmount: sumDisputes(["DENIED"], "amountDisputed"),
      pendingAmount: sumDisputes(["PREPARING", "READY", "SUBMITTED"], "amountDisputed"),
      pendingDisputes: activeDisputes.filter((d) => ["PREPARING", "READY", "SUBMITTED"].includes(d.status)).length,
    },
    shipments,
    violations,
    teamInfluence: [...byTeam.entries()].map(([team, v]) => ({ team, amount: round(v.amount), lines: v.lines })).sort((a, b) => b.amount - a.amount),
    trend: await buildTrend(programIds, report.programs.map((p) => p.program), fiscalMonth, field),
  };
}

interface ThdSummary {
  pre: number;
  post: number;
  approved: number;
  denied: number;
}

/** THD's P-Vendor summary totals per metric for a month, from the most recent export that has them. */
async function thdPostDisputeOffsets(metricIds: string[], inPeriod: Prisma.ComplianceLineWhereInput): Promise<Map<string, ThdSummary>> {
  const rows = await prisma.spmSummaryRow.findMany({
    where: {
      mVendor: null,
      metricId: { in: metricIds },
      offsetsPreDispute: { not: null },
      offsetsPostDispute: { not: null },
      batch: { lines: { some: inPeriod } },
    },
    orderBy: { batch: { importedAt: "desc" } },
  });
  const out = new Map<string, ThdSummary>();
  for (const r of rows) {
    if (!r.metricId || out.has(r.metricId)) continue;
    out.set(r.metricId, {
      pre: Number(r.offsetsPreDispute),
      post: Number(r.offsetsPostDispute),
      approved: r.approvedLines ?? 0,
      denied: r.deniedLines ?? 0,
    });
  }
  return out;
}

async function buildTrend(programIds: string[], programs: { id: string; code: string }[], fiscalMonth: number, field: PeriodField): Promise<ScorecardData["trend"]> {
  const first = shiftFiscalMonth(fiscalMonth, -(TREND_MONTHS - 1));
  const range = { ...linesInPeriod(field, { gte: first, lte: fiscalMonth }), metric: { programId: { in: programIds } } };
  const [metrics, offsets, recovered] = await Promise.all([
    prisma.metric.findMany({ where: { programId: { in: programIds } }, select: { id: true, programId: true } }),
    prisma.complianceLine.groupBy({ by: ["metricId", field], where: { ...range, isCompliant: false }, _sum: { offsetAmount: true } }),
    prisma.dispute.findMany({ where: { status: { in: ["APPROVED", "PARTIAL"] }, line: range }, select: { amountRecovered: true, line: { select: { fiscalMonth: true, receivedMonth: true } } } }),
  ]);
  const codeOf = new Map(metrics.map((m) => [m.id, programs.find((p) => p.id === m.programId)?.code ?? ""]));

  return Array.from({ length: TREND_MONTHS }, (_, i) => {
    const fm = shiftFiscalMonth(first, i);
    const byProgram: Record<string, number> = Object.fromEntries(programs.map((p) => [p.code, 0]));
    for (const g of offsets.filter((o) => (o as unknown as Record<PeriodField, number>)[field] === fm)) {
      const code = codeOf.get(g.metricId)!;
      byProgram[code] = round((byProgram[code] ?? 0) + Number(g._sum.offsetAmount ?? 0));
    }
    return {
      fiscalMonth: fm,
      label: fiscalLabel(fm),
      byProgram,
      preOffset: round(Object.values(byProgram).reduce((s, v) => s + v, 0)),
      recovered: round(recovered.filter((d) => periodOf(field, d.line) === fm).reduce((s, d) => s + Number(d.amountRecovered ?? 0), 0)),
    };
  });
}

export function summarizeShipments(inputs: ShipmentInput[]): ScorecardShipments {
  const programs = inputs.map((i) => {
    const smallParcel = i.counts.SMALL_PARCEL;
    const ltl = i.counts.LTL_TL;
    return { code: i.code, name: i.name, smallParcel, ltl, total: smallParcel === null && ltl === null ? null : (smallParcel ?? 0) + (ltl ?? 0) };
  });
  const sum = (pick: (p: (typeof programs)[number]) => number | null) => programs.reduce((s, p) => s + (pick(p) ?? 0), 0);
  const dcs = programs.filter((p) => p.code === "US_RDC" || p.code === "US_DFC");
  return {
    programs,
    totals: { smallParcel: sum((p) => p.smallParcel), ltl: sum((p) => p.ltl), total: sum((p) => p.total) },
    transportationLtl: dcs.length && dcs.some((p) => p.ltl !== null) ? dcs.reduce((s, p) => s + (p.ltl ?? 0), 0) : null,
    complete: programs.every((p) => p.smallParcel !== null && p.ltl !== null),
  };
}
