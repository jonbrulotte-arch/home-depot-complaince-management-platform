import { prisma } from "@/lib/prisma";
import { scorecardData } from "@/lib/scorecard-store";
import { ensureShareToken } from "@/lib/scorecard-share";
import { buildSummary } from "@/lib/summarizer";

/** The summary of the chosen published reports, and the public dashboard's path when it is on. */
export async function loadSummary(ids: string[]) {
  const [chosen, settings] = await Promise.all([
    ids.length
      ? prisma.complianceReport.findMany({
          where: { id: { in: ids }, status: "PUBLISHED", scorecard: { publishedAt: { not: null } } },
          select: { id: true, title: true, scorecard: { select: { data: true } } },
        })
      : Promise.resolve([]),
    prisma.siteSettings.findUnique({ where: { id: "site" }, select: { publicDashboardToken: true } }),
  ]);
  const snapshots = chosen.map((c) => ({ ...c, data: scorecardData(c.scorecard!.data) }));
  // Disputes submitted and still awaiting THD's decision, read live rather than from the snapshots
  const lineIds = snapshots.flatMap((c) => c.data.violations.flatMap((v) => (v.lineId ? [v.lineId] : [])));
  const submitted = lineIds.length
    ? await prisma.dispute.findMany({ where: { lineId: { in: lineIds }, status: "SUBMITTED" }, select: { lineId: true, amountDisputed: true } })
    : [];
  const awaiting = Object.fromEntries(submitted.map((d) => [d.lineId, Number(d.amountDisputed)]));
  const summary = snapshots.length
    ? buildSummary(
        await Promise.all(
          snapshots.map(async (c) => ({
            reportId: c.id,
            title: c.title,
            data: c.data,
            awaiting,
            // The team may not have accounts, so links go to the public scorecard pages
            scorecardPath: await ensureShareToken(c.id).then((t) => (t ? `/s/${t}` : `/scorecards/${c.id}`)),
          })),
        ),
      )
    : null;
  return { summary, dashboardPath: settings?.publicDashboardToken ? `/d/${settings.publicDashboardToken}` : null };
}
