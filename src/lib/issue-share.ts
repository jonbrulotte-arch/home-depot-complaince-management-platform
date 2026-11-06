import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBranding } from "@/lib/branding";
import { issueLabel } from "@/lib/issues";
import { getIssue } from "@/lib/issues-data";
import { issuePdf } from "@/lib/issue-pdf";
import { getTimeZone } from "@/lib/time-zone-server";

// Public read-only links to Issue Log issues (/i/<token>). Someone who can manage issues turns a
// link on, replaces it (the old one stops working) or turns it off. Anyone with the link sees the
// issue without signing in, and can download its PDF; attached files stay inside the platform.

export const isShareToken = (token: string) => /^[A-Za-z0-9_-]{20,64}$/.test(token);

/** Turns on (or replaces) an issue's public link and returns its token. */
export async function shareIssue(issueId: string, userId: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await prisma.issueShare.upsert({
    where: { issueId },
    create: { issueId, token, createdById: userId },
    update: { token, createdAt: new Date(), createdById: userId },
  });
  return token;
}

/** The issue behind a public link, with its POs tied to compliance data, or null. */
export async function sharedIssue(token: string) {
  if (!isShareToken(token)) return null;
  const share = await prisma.issueShare.findUnique({ where: { token }, select: { issueId: true } });
  return share ? getIssue(share.issueId) : null;
}

/** The issue PDF as a download, with times in the viewer's zone. */
export async function issuePdfResponse(found: NonNullable<Awaited<ReturnType<typeof getIssue>>>) {
  const [{ siteName }, timeZone] = await Promise.all([getBranding(), getTimeZone()]);
  const buffer = await issuePdf(found, { timeZone, siteName });
  const name = `${issueLabel(found.issue.number)}_${found.issue.title.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60)}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" },
  });
}
