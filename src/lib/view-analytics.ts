import { Prisma, type HitChannel, type HitKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fiscalLabel } from "@/lib/fiscal";
import { fillDays } from "@/lib/view-analytics-shared";

export { ANALYTICS_RANGES, browserLabel, parseRange, type DayPoint } from "@/lib/view-analytics-shared";

const sinceOf = (days: number) => (days ? new Date(Date.now() - days * 86_400_000) : new Date(0));

export interface HitTotals {
  hits: number;
  views: number;
  downloads: number;
  sessions: number;
  users: number;
  publicHits: number;
  lastAt: Date | null;
}

type TotalsRow = { scorecardId: string; hits: bigint; views: bigint; downloads: bigint; sessions: bigint; users: bigint; publicHits: bigint; lastAt: Date | null };

const toTotals = (r: TotalsRow | undefined): HitTotals => ({
  hits: Number(r?.hits ?? 0),
  views: Number(r?.views ?? 0),
  downloads: Number(r?.downloads ?? 0),
  sessions: Number(r?.sessions ?? 0),
  users: Number(r?.users ?? 0),
  publicHits: Number(r?.publicHits ?? 0),
  lastAt: r?.lastAt ?? null,
});

async function totalsByScorecard(since: Date, scorecardId?: string): Promise<Map<string, HitTotals>> {
  const rows = await prisma.$queryRaw<TotalsRow[]>`
    SELECT "scorecardId",
           COUNT(*) AS hits,
           COUNT(*) FILTER (WHERE kind = 'VIEW') AS views,
           COUNT(*) FILTER (WHERE kind <> 'VIEW') AS downloads,
           COUNT(DISTINCT "sessionId") AS sessions,
           COUNT(DISTINCT "userId") AS users,
           COUNT(*) FILTER (WHERE channel = 'PUBLIC') AS "publicHits",
           MAX(at) AS "lastAt"
    FROM "ScorecardHit"
    WHERE at >= ${since} ${scorecardId ? Prisma.sql`AND "scorecardId" = ${scorecardId}` : Prisma.empty}
    GROUP BY "scorecardId"`;
  return new Map(rows.map((r) => [r.scorecardId, toTotals(r)]));
}

/** Every published scorecard with its hits in the window, the most recent report month first. */
export async function analyticsOverview(days: number) {
  const since = sinceOf(days);
  const [scorecards, totals, [overall]] = await Promise.all([
    prisma.scorecard.findMany({
      where: { publishedAt: { not: null } },
      select: { id: true, reportId: true, version: true, publishedAt: true, report: { select: { title: true, period: { select: { fiscalMonth: true } } } } },
      orderBy: [{ report: { period: { fiscalMonth: "desc" } } }, { publishedAt: "desc" }],
    }),
    totalsByScorecard(since),
    // Sessions and people are counted once across all scorecards, so they aren't summed per row
    prisma.$queryRaw<{ sessions: bigint; users: bigint }[]>`
      SELECT COUNT(DISTINCT "sessionId") AS sessions, COUNT(DISTINCT "userId") AS users FROM "ScorecardHit" WHERE at >= ${since}`,
  ]);
  const rows = scorecards.map((s) => ({
    reportId: s.reportId,
    title: s.report.title,
    month: fiscalLabel(s.report.period.fiscalMonth),
    version: s.version,
    publishedAt: s.publishedAt!,
    ...toTotals(undefined),
    ...totals.get(s.id),
  }));
  const all = { ...toTotals(undefined), sessions: Number(overall?.sessions ?? 0), users: Number(overall?.users ?? 0) };
  for (const r of rows) {
    all.hits += r.hits;
    all.views += r.views;
    all.downloads += r.downloads;
    all.publicHits += r.publicHits;
  }
  return { rows, totals: all };
}

export interface ViewerRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  views: number;
  downloads: number;
  publicLink: boolean;
  firstAt: Date;
  lastAt: Date;
}

export interface HitRow {
  id: string;
  at: Date;
  kind: HitKind;
  channel: HitChannel;
  version: number;
  sessionId: string;
  user: { id: string; name: string } | null;
  ip: string | null;
  userAgent: string | null;
}

/** One published scorecard's hits in the window: totals, hits per day, signed-in viewers and the latest hits. */
export async function scorecardAnalytics(reportId: string, days: number) {
  const scorecard = await prisma.scorecard.findUnique({
    where: { reportId },
    select: { id: true, version: true, publishedAt: true, shareToken: true, report: { select: { id: true, title: true, status: true, period: { select: { fiscalMonth: true } } } } },
  });
  if (!scorecard?.publishedAt) return null;
  const since = sinceOf(days);
  const where = { scorecardId: scorecard.id, at: { gte: since } };

  const [totals, daily, byUser, recent, first] = await Promise.all([
    totalsByScorecard(since, scorecard.id),
    prisma.$queryRaw<{ day: Date; hits: bigint; sessions: bigint }[]>`
      SELECT date_trunc('day', at) AS day, COUNT(*) AS hits, COUNT(DISTINCT "sessionId") AS sessions
      FROM "ScorecardHit" WHERE "scorecardId" = ${scorecard.id} AND at >= ${since}
      GROUP BY 1 ORDER BY 1`,
    prisma.scorecardHit.groupBy({
      by: ["userId", "kind", "channel"],
      where: { ...where, userId: { not: null } },
      _count: { _all: true },
      _min: { at: true },
      _max: { at: true },
    }),
    prisma.scorecardHit.findMany({
      where,
      orderBy: { at: "desc" },
      take: 100,
      select: { id: true, at: true, kind: true, channel: true, version: true, sessionId: true, ip: true, userAgent: true, user: { select: { id: true, name: true } } },
    }),
    prisma.scorecardHit.findFirst({ where, orderBy: { at: "asc" }, select: { at: true } }),
  ]);

  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(byUser.map((g) => g.userId!))] } },
    select: { id: true, name: true, email: true, active: true, role: { select: { name: true } } },
  });
  const viewers = new Map<string, ViewerRow>();
  for (const g of byUser) {
    const u = users.find((x) => x.id === g.userId);
    if (!u) continue;
    const v = viewers.get(u.id) ?? { userId: u.id, name: u.name, email: u.email, role: u.role.name, active: u.active, views: 0, downloads: 0, publicLink: false, firstAt: g._min.at!, lastAt: g._max.at! };
    if (g.kind === "VIEW") v.views += g._count._all;
    else v.downloads += g._count._all;
    if (g.channel === "PUBLIC") v.publicLink = true;
    if (g._min.at! < v.firstAt) v.firstAt = g._min.at!;
    if (g._max.at! > v.lastAt) v.lastAt = g._max.at!;
    viewers.set(u.id, v);
  }

  return {
    reportId: scorecard.report.id,
    title: scorecard.report.title,
    month: fiscalLabel(scorecard.report.period.fiscalMonth),
    version: scorecard.version,
    publishedAt: scorecard.publishedAt,
    stillPublished: scorecard.report.status === "PUBLISHED",
    totals: totals.get(scorecard.id) ?? toTotals(undefined),
    daily: fillDays(
      daily.map((d) => ({ day: d.day, hits: Number(d.hits), sessions: Number(d.sessions) })),
      days ? since : (first?.at ?? new Date()),
    ),
    viewers: [...viewers.values()].sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime()),
    recent: recent as HitRow[],
  };
}
