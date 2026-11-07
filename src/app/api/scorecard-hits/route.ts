import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-guard";
import { badRequest, parseJson } from "@/lib/api";
import { sharedScorecard } from "@/lib/scorecard-share";
import { recordScorecardHit } from "@/lib/scorecard-hits";

const schema = z.union([z.object({ reportId: z.string().trim().min(1).max(64) }), z.object({ token: z.string().trim().min(1).max(64) })]);

/** A published scorecard page was opened: in the app (reportId, signed in) or by its public link (token). */
export async function POST(req: Request) {
  const body = await parseJson(req, schema);
  if (body.error) return body.error;
  const user = await getCurrentUser();

  if ("token" in body.data) {
    const found = await sharedScorecard(body.data.token);
    if (!found) return badRequest("This scorecard link is not available");
    await recordScorecardHit(found.scorecard, "PUBLIC", "VIEW", user?.id ?? null);
    return new NextResponse(null, { status: 204 });
  }

  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const scorecard = await prisma.scorecard.findUnique({ where: { reportId: body.data.reportId }, select: { id: true, version: true, publishedAt: true } });
  if (scorecard) await recordScorecardHit(scorecard, "APP", "VIEW", user.id);
  return new NextResponse(null, { status: 204 });
}
