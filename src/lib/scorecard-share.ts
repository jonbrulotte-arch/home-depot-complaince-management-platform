import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBranding } from "@/lib/branding";
import { scorecardData } from "@/lib/scorecard-store";
import { scorecardPdf } from "@/lib/scorecard-pdf";
import { scorecardWorkbook } from "@/lib/scorecard-export";
import type { ScorecardData } from "@/lib/scorecard";

// Public links to published scorecards (/s/<token>). The token is made the first time a published
// scorecard is shown to someone who can share it, and works for as long as the report stays
// published; unpublishing takes the page down and republishing brings back the same link.

/** The public link token for a report's published scorecard, created if needed; null when not published. */
export async function ensureShareToken(reportId: string): Promise<string | null> {
  const scorecard = await prisma.scorecard.findUnique({ where: { reportId }, select: { publishedAt: true, shareToken: true } });
  if (!scorecard?.publishedAt) return null;
  if (scorecard.shareToken) return scorecard.shareToken;
  const token = randomBytes(24).toString("base64url");
  await prisma.scorecard.update({ where: { reportId }, data: { shareToken: token } });
  return token;
}

/** A published scorecard by its public token, or null. */
export async function sharedScorecard(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const scorecard = await prisma.scorecard.findUnique({ where: { shareToken: token }, include: { report: { select: { status: true } } } });
  if (!scorecard?.publishedAt || scorecard.report.status !== "PUBLISHED") return null;
  return {
    scorecard,
    data: scorecardData(scorecard.data),
    status: { version: scorecard.version, publishedAt: scorecard.publishedAt.toISOString() },
  };
}

type Status = { version: number; publishedAt: string | null };
const fileName = (data: ScorecardData, status: Status, ext: string) => `THD_Compliance_Scorecard_FM${data.fiscalMonth}_v${status.version}.${ext}`;

export async function scorecardPdfResponse(data: ScorecardData, status: Status) {
  const buffer = await scorecardPdf(data, status, (await getBranding()).siteName);
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileName(data, status, "pdf")}"` },
  });
}

export async function scorecardExcelResponse(data: ScorecardData, status: Status) {
  const buffer = await scorecardWorkbook(data, status, (await getBranding()).siteName);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName(data, status, "xlsx")}"`,
    },
  });
}
