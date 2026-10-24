import type { IdParams } from "@/lib/api";
import { withFeedback } from "@/lib/feedback";
import { scorecardForDownload } from "@/lib/scorecard-store";
import { scorecardExcelResponse } from "@/lib/scorecard-share";

export async function GET(_req: Request, { params }: IdParams) {
  const { id } = await params;
  const found = await scorecardForDownload(id);
  if (found.error) return found.error;
  return scorecardExcelResponse(await withFeedback(id, found.data), found.status);
}
