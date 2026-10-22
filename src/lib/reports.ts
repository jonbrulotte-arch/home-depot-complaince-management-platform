import type { MetricRule, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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
  /** Null when only non-compliant lines were imported, so no denominator is known */
  compliancePct: number | null;
  thresholdPct: number | null;
  offsetType: "NONE" | "FLAT" | "PCT_VALUE" | null;
  meetsThreshold: boolean | null;
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

/** Per-metric totals for the given programs in one fiscal month. */
export async function getMetricStats(programIds: string[], fiscalMonth: number): Promise<MetricStat[]> {
  const metrics = await prisma.metric.findMany({
    where: { programId: { in: programIds }, active: true },
    include: { rules: true },
    orderBy: [{ program: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });
  const where = { fiscalMonth, metricId: { in: metrics.map((m) => m.id) } };
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

    // A percentage needs compliant lines as a denominator; violation-only exports have none.
    // Fill Rate is measured in units when quantities are present, as THD does.
    let compliancePct: number | null = null;
    if (compliant > 0) {
      compliancePct = m.code === "FILL_RATE" && ordered > 0 ? (received / ordered) * 100 : (compliant / (compliant + nc)) * 100;
    }
    const rule = ruleFor(m.rules, fiscalMonth);
    const thresholdPct = rule ? Number(rule.thresholdPct) : null;

    const lines = nonCompliant.filter((l) => l.metricId === m.id);
    const disputes = lines.flatMap((l) => (l.dispute && l.dispute.status !== "WITHDRAWN" ? [{ ...l.dispute, line: l }] : []));
    const approvedLines = disputes.filter((d) => d.status === "APPROVED");
    const recovered = disputes
      .filter((d) => d.status === "APPROVED" || d.status === "PARTIAL")
      .reduce((sum, d) => sum + decimal(d.amountRecovered), 0);
    // An approved dispute turns the line compliant, which recalculates the metric
    let postDisputePct: number | null = null;
    if (compliancePct !== null) {
      if (m.code === "FILL_RATE" && ordered > 0) {
        const restored = approvedLines.reduce((sum, d) => sum + Math.max(0, decimal(d.line.orderedQty) - decimal(d.line.receivedQty)), 0);
        postDisputePct = Math.min(100, ((received + restored) / ordered) * 100);
      } else {
        postDisputePct = ((compliant + approvedLines.length) / (compliant + nc)) * 100;
      }
    }
    // Percentage-based offsets are only assessed below the threshold, so they fall away entirely
    // when the recalculated performance meets it
    let postDisputeOffset = Math.max(0, offset - recovered);
    if (rule?.offsetType === "PCT_VALUE" && postDisputePct !== null && thresholdPct !== null && postDisputePct >= thresholdPct) {
      postDisputeOffset = 0;
    }
    return {
      metricId: m.id,
      programId: m.programId,
      code: m.code,
      name: m.name,
      total: compliant + nc,
      nonCompliant: nc,
      reviewed: nonCompliant.filter((l) => l.metricId === m.id && isDecided(l.review?.disposition)).length,
      offset: Math.round(offset * 100) / 100,
      compliancePct,
      thresholdPct,
      offsetType: rule?.offsetType ?? null,
      meetsThreshold: compliancePct == null || thresholdPct == null ? null : compliancePct >= thresholdPct,
      disputed: disputes.length,
      approved: approvedLines.length,
      recovered: Math.round(recovered * 100) / 100,
      postDisputePct,
      postDisputeOffset: Math.round(postDisputeOffset * 100) / 100,
    };
  });
}
