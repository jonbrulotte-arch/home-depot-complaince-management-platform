import type { IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth-guard";
import { withFeedback } from "@/lib/feedback";
import { scorecardForDownload } from "@/lib/scorecard-store";
import { scorecardExcelResponse } from "@/lib/scorecard-share";
import { recordScorecardHit } from "@/lib/scorecard-hits";

export async function GET(_req: Request, { params }: IdParams) {
  const { id } = await params;
  const found = await scorecardForDownload(id);
  if (found.error) return found.error;
  const user = await getCurrentUser();
  await recordScorecardHit(found.scorecard, "APP", "EXCEL", user?.id ?? null);
  await audit(user?.id ?? null, "scorecard.download", "Scorecard", found.scorecard.id, { reportId: id, format: "EXCEL", version: found.scorecard.version });
  return scorecardExcelResponse(await withFeedback(id, found.data), found.status);
}
