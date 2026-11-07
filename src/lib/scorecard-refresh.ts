import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { buildScorecard, type ScorecardData } from "@/lib/scorecard";

// "Refresh scorecards": rebuilds every published scorecard from the current data (dispute
// decisions, reviews, teams, late imports) and replaces the snapshot only when something changed.
// Refreshed scorecards stay published the whole time: their publish date, public link and
// feedback are kept; the version goes up and the generated time is now.

export interface RefreshChange {
  reportId: string;
  title: string;
  fiscalMonth: number;
  fromVersion: number;
  toVersion: number;
  before: Pick<ScorecardData["totals"], "violations" | "preOffset" | "postOffset" | "recovered" | "pendingAmount">;
  after: Pick<ScorecardData["totals"], "violations" | "preOffset" | "postOffset" | "recovered" | "pendingAmount">;
}

export interface RefreshResult {
  checked: number;
  changed: RefreshChange[];
  failed: { reportId: string; title: string; error: string }[];
}

/** JSON with object keys sorted, so a snapshot read back from the database (jsonb reorders keys) compares equal. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The snapshot without the fields that change on every build. */
export function comparable(data: ScorecardData): string {
  const { generatedAt: _generatedAt, ...rest } = data;
  void _generatedAt;
  return stableJson(rest);
}

const totalsOf = (d: ScorecardData) => ({
  violations: d.totals.violations,
  preOffset: d.totals.preOffset,
  postOffset: d.totals.postOffset,
  recovered: d.totals.recovered,
  pendingAmount: d.totals.pendingAmount,
});

/** Refreshes every published scorecard (oldest month first); `userId` null when run from a script. */
export async function refreshPublishedScorecards(userId: string | null): Promise<RefreshResult> {
  const published = await prisma.scorecard.findMany({
    where: { publishedAt: { not: null }, report: { status: "PUBLISHED" } },
    select: { id: true, reportId: true, version: true, data: true, report: { select: { title: true, period: { select: { fiscalMonth: true } } } } },
    orderBy: { report: { period: { fiscalMonth: "asc" } } },
  });
  const result: RefreshResult = { checked: published.length, changed: [], failed: [] };
  for (const s of published) {
    try {
      const before = s.data as unknown as ScorecardData;
      const after = await buildScorecard(s.reportId);
      if (comparable(before) === comparable(after)) continue;
      const saved = await prisma.scorecard.update({
        where: { id: s.id },
        // Same publish date, link and feedback; a new version and generated time
        data: { data: after as unknown as Prisma.InputJsonObject, generatedAt: new Date(), generatedById: userId, version: { increment: 1 } },
        select: { version: true },
      });
      const change: RefreshChange = {
        reportId: s.reportId,
        title: s.report.title,
        fiscalMonth: s.report.period.fiscalMonth,
        fromVersion: s.version,
        toVersion: saved.version,
        before: totalsOf(before),
        after: totalsOf(after),
      };
      result.changed.push(change);
      await audit(userId, "scorecard.refresh", "Scorecard", s.id, { report: s.report.title, version: { from: s.version, to: saved.version }, before: change.before, after: change.after });
    } catch (e) {
      result.failed.push({ reportId: s.reportId, title: s.report.title, error: e instanceof Error ? e.message : String(e) });
    }
  }
  await audit(userId, "scorecard.refreshAll", "Scorecard", null, { checked: result.checked, changed: result.changed.length, failed: result.failed.length });
  return result;
}
