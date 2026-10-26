import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import { scorecardData } from "@/lib/scorecard-store";
import { formatDate } from "@/lib/utils";
import { ScorecardView } from "@/components/scorecard/scorecard-view";
import { ScorecardToolbar } from "@/components/scorecard/scorecard-toolbar";
import { ScorecardShareBar } from "@/components/scorecard/scorecard-share-bar";
import { ensureShareToken } from "@/lib/scorecard-share";
import { withFeedback } from "@/lib/feedback";
import { ScorecardHitBeacon } from "@/components/scorecard/scorecard-hit-beacon";

export default async function PublishedScorecardPage({ params }: { params: Promise<{ reportId: string }> }) {
  const user = await requirePagePermission("view.dashboard");
  const { reportId } = await params;
  const scorecard = await prisma.scorecard.findUnique({ where: { reportId } });
  if (!scorecard?.publishedAt) notFound();
  const shareToken = await ensureShareToken(reportId);
  const canFeedback = user.permissions.has("feedback.view");
  const feedbackCount = canFeedback ? await prisma.scorecardFeedback.count({ where: { reportId } }) : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 print:p-0 print:max-w-none">
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <Link href="/scorecards" className="inline-flex items-center text-xs text-gray-500 hover:text-gray-700">
            <ChevronLeft className="h-4 w-4" /> Scorecards
          </Link>
          <p className="text-sm text-gray-500">Published {formatDate(scorecard.publishedAt)} · version {scorecard.version}</p>
        </div>
        <ScorecardToolbar reportId={reportId} canRegenerate={false} canExport />
      </div>
      <ScorecardShareBar sharePath={shareToken ? `/s/${shareToken}` : null} feedbackHref={canFeedback ? `/feedback/${reportId}` : null} feedbackCount={feedbackCount} />
      <ScorecardView data={await withFeedback(reportId, scorecardData(scorecard.data))} />
      <ScorecardHitBeacon reportId={reportId} />
    </div>
  );
}
