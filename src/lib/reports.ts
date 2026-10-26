import type { MetricRule, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPeriodField, linesInPeriod } from "@/lib/periods";
import { dropShipFillRatePct, enteredLinesPct, lineCountKey, pctOffsetFallsAway } from "@/lib/scorecard-rules";
import { periodOfMetric } from "@/lib/shipment-ranges";

/** The rule in force for a fiscal month: the latest one effective on or before it. */
export function ruleFor<T extends Pick<MetricRule, "effectiveFrom">>(rules: T[], fiscalMonth: number): T | null {
  return rules.filter((r) => r.effectiveFrom <= fiscalMonth).sort((a, b) => b.effectiveFrom - a.effectiveFrom)[0] ?? null;
}

export interface MetricStat {
  metricId: string;
  programId: string;
  code: string;
  name: string;
  total: number;
  nonCompliant: number;
  reviewed: number;
  offset: number;
  /** Null when only non-compliant lines were imported and no line count was entered */
  compliancePct: number | null;
  /** Where the line total behind the percentage comes from: the export, or the count entered on the report */
  linesSource: "DATA" | "ENTERED" | null;
  thresholdPct: number | null;
  offsetType: "NONE" | "FLAT" | "PCT_VALUE" | null;
  meetsThreshold: boolean | null;
  /** Lines reviewed as Cancelled / Resolved, which count as compliant */
  resolved: number;
  /** Lines with an active (not withdrawn) dispute */
  disputed: number;
  approved: number;
  recovered: number;
  /** Performance and offset once approved disputes are applied, per THD's recalculation */
  postDisputePct: number | null;
  postDisputeOffset: number;
}

/** A line counts as reviewed once it has a final decision; "needs research" is still open. */
export function isDecided(disposition: string | null | undefined): boolean {
  return Boolean(disposition) && disposition !== "PENDING" && disposition !== "NEEDS_RESEARCH";
}

const decimal = (v: Prisma.Decimal | null | undefined) => (v == null ? 0 : Number(v));

/**
 * Per-metric totals for the given programs in one report period (see src/lib/periods.ts).
 * `lineCounts` are the report's entered lines per program and compliance period (`lineCountKey`),
 * the denominator for metrics whose export lists only violations.
 */
export async function getMetricStats(programIds: string[], fiscalMonth: number, lineCounts: Record<string, number> = {}): Promise<MetricStat[]> {
  const field = await getPeriodField();
  const metrics = await prisma.metric.findMany({
    where: { programId: { in: programIds }, active: true },
    include: { rules: true, program: { select: { code: true } } },
    orderBy: [{ program: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });
  const where = { ...linesInPeriod(field, fiscalMonth), metricId: { in: metrics.map((m) => m.id) } };
  const [groups, nonCompliant] = await Promise.all([
    prisma.complianceLine.groupBy({
      by: ["metricId", "isCompliant"],
      where,
      _count: { _all: true },
      _sum: { offsetAmount: true, orderedQty: true, receivedQty: true },
    }),
    prisma.complianceLine.findMany({
      where: { ...where, isCompliant: false },
      select: {
        metricId: true,
        orderedQty: true,
        receivedQty: true,
        offsetAmount: true,
        review: { select: { disposition: true } },
        dispute: { select: { status: true, amountRecovered: true } },
      },
    }),
  ]);

  return metrics.map((m) => {
    const rows = groups.filter((g) => g.metricId === m.id);
    const compliant = rows.find((g) => g.isCompliant)?._count._all ?? 0;
    const nc = rows.find((g) => !g.isCompliant)?._count._all ?? 0;
    const offset = rows.reduce((sum, g) => sum + decimal(g._sum.offsetAmount), 0);
    const ordered = rows.reduce((sum, g) => sum + decimal(g._sum.orderedQty), 0);
    const received = rows.reduce((sum, g) => sum + decimal(g._sum.receivedQty), 0);

    const lines = nonCompliant.filter((l) => l.metricId === m.id);
    // Cancelled / Resolved lines are not real violations: they count as compliant, with their
    // shortfall restored, before and after disputes
    const resolvedLines = lines.filter((l) => l.review?.disposition === "RESOLVED");
    const shortfall = (ls: typeof lines) => ls.reduce((sum, l) => sum + Math.max(0, decimal(l.orderedQty) - decimal(l.receivedQty)), 0);

    // US Drop Ship's Fill Rate sheet holds only cancelled lines; the shipped lines are its On Time lines
    const dropShipFillRate = m.code === "FILL_RATE" && m.program.code === "US_DS";
    const shipped = dropShipFillRate
      ? groups.filter((g) => metrics.some((o) => o.id === g.metricId && o.programId === m.programId && o.code === "ON_TIME")).reduce((sum, g) => sum + g._count._all, 0) + compliant
      : 0;

    // A percentage needs compliant lines as a denominator; violation-only exports have none.
    // Fill Rate is measured in units when quantities are present, as THD does.
    let compliancePct: number | null = null;
    // THD's own figure, before Cancelled / Resolved decisions: decides whether its offset stands
    let thdPct: number | null = null;
    if (dropShipFillRate) {
      compliancePct = dropShipFillRatePct(shipped, nc, resolvedLines.length);
      thdPct = dropShipFillRatePct(shipped, nc, 0);
    } else if (compliant > 0) {
      thdPct =
        m.code === "FILL_RATE" && ordered > 0 ? Math.min(100, (received / ordered) * 100) : (compliant / (compliant + nc)) * 100;
      compliancePct =
        m.code === "FILL_RATE" && ordered > 0
          ? Math.min(100, ((received + shortfall(resolvedLines)) / ordered) * 100)
          : ((compliant + resolvedLines.length) / (compliant + nc)) * 100;
    }
    // No denominator in the export: use the lines entered on the report for this compliance period
    const enteredLines = compliancePct === null ? (lineCounts[lineCountKey(m.programId, periodOfMetric(m.code))] ?? 0) : 0;
    if (enteredLines > 0) {
      compliancePct = enteredLinesPct(enteredLines, nc, resolvedLines.length);
      thdPct = enteredLinesPct(enteredLines, nc, 0);
    }
    const rule = ruleFor(m.rules, fiscalMonth);
    const thresholdPct = rule ? Number(rule.thresholdPct) : null;

    const disputes = lines.flatMap((l) => (l.dispute && l.dispute.status !== "WITHDRAWN" ? [{ ...l.dispute, line: l }] : []));
    const approvedLines = disputes.filter((d) => d.status === "APPROVED");
    const recovered = disputes
      .filter((d) => d.status === "APPROVED" || d.status === "PARTIAL")
      .reduce((sum, d) => sum + decimal(d.amountRecovered), 0);
    // An approved dispute turns the line compliant, which recalculates the metric
    const cleared = [...resolvedLines, ...approvedLines.filter((d) => d.line.review?.disposition !== "RESOLVED").map((d) => d.line)];
    let postDisputePct: number | null = null;
    if (enteredLines > 0) {
      postDisputePct = enteredLinesPct(enteredLines, nc, cleared.length);
    } else if (dropShipFillRate) {
      postDisputePct = dropShipFillRatePct(shipped, nc, cleared.length);
    } else if (compliancePct !== null) {
      if (m.code === "FILL_RATE" && ordered > 0) {
        postDisputePct = Math.min(100, ((received + shortfall(cleared)) / ordered) * 100);
      } else {
        postDisputePct = ((compliant + cleared.length) / (compliant + nc)) * 100;
      }
    }
    // Percentage-based offsets are only assessed below the threshold, so they fall away entirely
    // when the recalculated performance meets it (see pctOffsetFallsAway). Offsets THD charged on
    // resolved lines are shown pre-dispute but not owed.
    const resolvedOffset = resolvedLines.filter((l) => !(l.dispute && ["APPROVED", "PARTIAL"].includes(l.dispute.status))).reduce((sum, l) => sum + decimal(l.offsetAmount), 0);
    let postDisputeOffset = Math.max(0, offset - recovered - resolvedOffset);
    if (rule?.offsetType === "PCT_VALUE" && pctOffsetFallsAway(thdPct, postDisputePct, thresholdPct)) {
      postDisputeOffset = 0;
    }
    return {
      metricId: m.id,
      programId: m.programId,
      code: m.code,
      name: m.name,
      total: enteredLines > 0 ? enteredLines : dropShipFillRate ? shipped + nc : compliant + nc,
      nonCompliant: nc,
      reviewed: nonCompliant.filter((l) => l.metricId === m.id && isDecided(l.review?.disposition)).length,
      offset: Math.round(offset * 100) / 100,
      compliancePct,
      linesSource: enteredLines > 0 ? "ENTERED" : compliancePct === null ? null : "DATA",
      thresholdPct,
      offsetType: rule?.offsetType ?? null,
      meetsThreshold: compliancePct == null || thresholdPct == null ? null : compliancePct >= thresholdPct,
      resolved: resolvedLines.length,
      disputed: disputes.length,
      approved: approvedLines.length,
      recovered: Math.round(recovered * 100) / 100,
      postDisputePct,
      postDisputeOffset: Math.round(postDisputeOffset * 100) / 100,
    };
  });
}
