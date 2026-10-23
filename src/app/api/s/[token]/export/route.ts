import { NextResponse } from "next/server";
import { scorecardExcelResponse, sharedScorecard } from "@/lib/scorecard-share";

type Params = { params: Promise<{ token: string }> };

/** Public download of a shared, published scorecard; no sign-in needed. */
export async function GET(_req: Request, { params }: Params) {
  const found = await sharedScorecard((await params).token);
  if (!found) return NextResponse.json({ error: "This scorecard link is not available" }, { status: 404 });
  return scorecardExcelResponse(found.data, found.status);
}
