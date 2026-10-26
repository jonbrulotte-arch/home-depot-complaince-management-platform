import { prisma } from "@/lib/prisma";
import { scorecardData } from "@/lib/scorecard-store";
import type { ScorecardData, ScorecardViolation } from "@/lib/scorecard";

// Scorecard Feedback: people outside the compliance team (the warehouse) comment on each
// violation of a published scorecard. Feedback is keyed by the compliance line, which scorecards
// record in their snapshot (`ScorecardViolation.lineId`); older snapshots need regenerating first.

export interface FeedbackItem {
  id: string;
  lineId: string;
  body: string;
  authorId: string | null;
  author: string | null;
  createdAt: string;
}

/** Published scorecards whose violations can take feedback, newest first. */
export async function feedbackScorecards() {
  const scorecards = await prisma.scorecard.findMany({
    where: { publishedAt: { not: null }, report: { status: "PUBLISHED" } },
    include: { report: { select: { id: true, title: true, historical: true } } },
    orderBy: { publishedAt: "desc" },
  });
  const counts = new Map(
    (await prisma.scorecardFeedback.groupBy({ by: ["reportId"], _count: { _all: true } })).map((g) => [g.reportId, g._count._all]),
  );
  const lines = new Map(
    (await prisma.scorecardFeedback.groupBy({ by: ["reportId", "lineId"] })).reduce((m, g) => m.set(g.reportId, (m.get(g.reportId) ?? 0) + 1), new Map<string, number>()),
  );
  return scorecards.flatMap((s) => {
    const data = scorecardData(s.data);
    const violations = data.violations.filter((v) => v.lineId);
    if (!violations.length) return [];
    return [
      {
        reportId: s.reportId,
        title: s.report.title,
        periodLabel: data.periodLabel,
        publishedAt: s.publishedAt!.toISOString(),
        violations: violations.length,
        feedback: counts.get(s.reportId) ?? 0,
        violationsWithFeedback: lines.get(s.reportId) ?? 0,
      },
    ];
  });
}

/** A published scorecard's violations with their feedback, or null when it can't take feedback. */
export async function scorecardFeedback(reportId: string) {
  const scorecard = await prisma.scorecard.findUnique({ where: { reportId }, include: { report: { select: { status: true, title: true } } } });
  if (!scorecard?.publishedAt || scorecard.report.status !== "PUBLISHED") return null;
  const data = scorecardData(scorecard.data);
  const violations = data.violations.filter((v): v is ScorecardViolation & { lineId: string } => Boolean(v.lineId));
  // PO record of each violation's line, for the link to its PO Record page
  const lines = await prisma.complianceLine.findMany({ where: { id: { in: violations.map((v) => v.lineId) } }, select: { id: true, poRecordId: true } });
  const poRecordOf = new Map(lines.map((l) => [l.id, l.poRecordId]));
  const feedback = await prisma.scorecardFeedback.findMany({
    where: { reportId },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return {
    title: scorecard.report.title,
    data,
    publishedAt: scorecard.publishedAt.toISOString(),
    violations: violations.map((v) => ({ ...v, poRecordId: poRecordOf.get(v.lineId) ?? null })),
    /** Violations in the snapshot without a line id (generated before feedback existed) */
    missingLineIds: data.violations.length - violations.length,
    feedback: feedback.map((f): FeedbackItem => ({
      id: f.id,
      lineId: f.lineId,
      body: f.body,
      authorId: f.authorId,
      author: f.author?.name ?? null,
      createdAt: f.createdAt.toISOString(),
    })),
  };
}

/**
 * The scorecard with each violation's current feedback attached. Feedback is live, not part of the
 * snapshot, so it shows on the scorecard, its public page and downloads without regenerating.
 */
export async function withFeedback(reportId: string, data: ScorecardData): Promise<ScorecardData> {
  if (!data.violations.some((v) => v.lineId)) return data;
  const feedback = await prisma.scorecardFeedback.findMany({
    where: { reportId },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!feedback.length) return data;
  const byLine = new Map<string, NonNullable<ScorecardViolation["feedback"]>>();
  for (const f of feedback) {
    byLine.set(f.lineId, [...(byLine.get(f.lineId) ?? []), { author: f.author?.name ?? null, body: f.body, createdAt: f.createdAt.toISOString() }]);
  }
  return { ...data, violations: data.violations.map((v) => (v.lineId && byLine.has(v.lineId) ? { ...v, feedback: byLine.get(v.lineId) } : v)) };
}
