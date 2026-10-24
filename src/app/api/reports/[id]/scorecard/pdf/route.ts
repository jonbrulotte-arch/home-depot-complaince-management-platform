import type { IdParams } from "@/lib/api";
import { withFeedback } from "@/lib/feedback";
import { scorecardForDownload } from "@/lib/scorecard-store";
import { scorecardPdfResponse } from "@/lib/scorecard-share";

export async function GET(_req: Request, { params }: IdParams) {
  const { id } = await params;
  const found = await scorecardForDownload(id);
  if (found.error) return found.error;
  return scorecardPdfResponse(await withFeedback(id, found.data), found.status);
}
