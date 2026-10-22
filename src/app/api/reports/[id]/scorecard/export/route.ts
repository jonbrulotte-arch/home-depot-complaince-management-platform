import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-guard";
import { notFound, type IdParams } from "@/lib/api";
import { scorecardWorkbook } from "@/lib/scorecard-export";
import { scorecardData } from "@/lib/scorecard-store";

export async function GET(_req: Request, { params }: IdParams) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const scorecard = await prisma.scorecard.findUnique({ where: { reportId: id } });
  if (!scorecard) return notFound("This report has no scorecard yet");
  // Published scorecards are readable by anyone with dashboard access; drafts need report access
  const allowed = user.permissions.has("reports.view") || (scorecard.publishedAt && user.permissions.has("view.dashboard"));
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const data = scorecardData(scorecard.data);
  const buffer = await scorecardWorkbook(data, { version: scorecard.version, publishedAt: scorecard.publishedAt?.toISOString() ?? null });
  const name = `THD_Compliance_Scorecard_FM${data.fiscalMonth}_v${scorecard.version}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
