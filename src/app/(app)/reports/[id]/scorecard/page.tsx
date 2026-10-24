import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import { buildScorecard } from "@/lib/scorecard";
import { scorecardData } from "@/lib/scorecard-store";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScorecardView } from "@/components/scorecard/scorecard-view";
import { ScorecardToolbar } from "@/components/scorecard/scorecard-toolbar";
import { ScorecardShareBar } from "@/components/scorecard/scorecard-share-bar";
import { ensureShareToken } from "@/lib/scorecard-share";
import { withFeedback } from "@/lib/feedback";

export default async function ReportScorecardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("reports.view");
  const { id } = await params;
  const report = await prisma.complianceReport.findUnique({
    where: { id },
    include: { scorecard: { include: { generatedBy: { select: { name: true } }, publishedBy: { select: { name: true } } } } },
  });
  if (!report) notFound();

  // Before generation, show a live preview of what the scorecard will contain
  const scorecard = report.scorecard;
  const data = scorecard ? await withFeedback(id, scorecardData(scorecard.data)) : await buildScorecard(id);
  const shareToken = await ensureShareToken(id);
  const canFeedback = Boolean(scorecard?.publishedAt) && user.permissions.has("feedback.view");
  const feedbackCount = canFeedback ? await prisma.scorecardFeedback.count({ where: { reportId: id } }) : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 print:p-0 print:max-w-none">
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <Link href={`/reports/${id}`} className="inline-flex items-center text-xs text-gray-500 hover:text-gray-700">
            <ChevronLeft className="h-4 w-4" /> {report.title}
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Scorecard</h1>
            {!scorecard && <Badge variant="secondary">Live preview</Badge>}
            {scorecard && !scorecard.publishedAt && <Badge variant="purple">Draft v{scorecard.version}</Badge>}
            {scorecard?.publishedAt && <Badge variant="success">Published v{scorecard.version}</Badge>}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {scorecard
              ? `Generated ${formatDateTime(scorecard.generatedAt)}${scorecard.generatedBy ? ` by ${scorecard.generatedBy.name}` : ""}` +
                (scorecard.publishedAt ? ` · published ${formatDateTime(scorecard.publishedAt)}${scorecard.publishedBy ? ` by ${scorecard.publishedBy.name}` : ""}` : "")
              : "Generate the scorecard from the report page once every dispute is submitted or withdrawn."}
          </p>
        </div>
        <ScorecardToolbar reportId={id} canRegenerate={report.status === "SCORECARD" && user.permissions.has("reports.advance")} canExport={Boolean(scorecard)} />
      </div>
      <ScorecardShareBar sharePath={shareToken ? `/s/${shareToken}` : null} feedbackHref={canFeedback ? `/feedback/${id}` : null} feedbackCount={feedbackCount} />
      <ScorecardView data={data} />
    </div>
  );
}
