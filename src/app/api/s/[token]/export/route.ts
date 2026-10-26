import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth-guard";
import { withFeedback } from "@/lib/feedback";
import { scorecardExcelResponse, sharedScorecard } from "@/lib/scorecard-share";
import { recordScorecardHit } from "@/lib/scorecard-hits";

type Params = { params: Promise<{ token: string }> };

/** Public download of a shared, published scorecard; no sign-in needed. */
export async function GET(_req: Request, { params }: Params) {
  const found = await sharedScorecard((await params).token);
  if (!found) return NextResponse.json({ error: "This scorecard link is not available" }, { status: 404 });
  const user = await getCurrentUser();
  await recordScorecardHit(found.scorecard, "PUBLIC", "EXCEL", user?.id ?? null);
  await audit(user?.id ?? null, "scorecard.download", "Scorecard", found.scorecard.id, { reportId: found.scorecard.reportId, format: "EXCEL", version: found.scorecard.version, publicLink: true });
  return scorecardExcelResponse(await withFeedback(found.scorecard.reportId, found.data), found.status);
}
