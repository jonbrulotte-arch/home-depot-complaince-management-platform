import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import type { HitChannel, HitKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/client-ip";

/** Browser session for View Analytics: a new one starts after 30 minutes without a hit */
export const HIT_SESSION_COOKIE = "cm_vs";
const SESSION_SECONDS = 30 * 60;
/** A repeat view of the same scorecard in the same session within this window is one hit (reloads) */
const REPEAT_VIEW_MS = 10_000;
// Link previews, crawlers and scripts; people's browsers don't match
const AUTOMATED = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|curl|wget|python-requests|node-fetch/i;

/**
 * Records a view or download of a published scorecard and renews the session cookie. Only for route
 * handlers (pages can't set cookies). Never throws: analytics must not break the page or download.
 */
export async function recordScorecardHit(
  scorecard: { id: string; version: number; publishedAt: Date | null },
  channel: HitChannel,
  kind: HitKind,
  userId: string | null,
): Promise<void> {
  if (!scorecard.publishedAt) return;
  try {
    const h = await headers();
    const userAgent = h.get("user-agent")?.slice(0, 300) || null;
    if (userAgent && AUTOMATED.test(userAgent)) return;
    const jar = await cookies();
    const existing = jar.get(HIT_SESSION_COOKIE)?.value;
    const sessionId = existing && /^[0-9a-f-]{36}$/.test(existing) ? existing : randomUUID();
    jar.set(HIT_SESSION_COOKIE, sessionId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: SESSION_SECONDS });

    if (kind === "VIEW") {
      const recent = await prisma.scorecardHit.findFirst({
        where: { scorecardId: scorecard.id, sessionId, kind, at: { gte: new Date(Date.now() - REPEAT_VIEW_MS) } },
        select: { id: true },
      });
      if (recent) return;
    }
    await prisma.scorecardHit.create({
      data: { scorecardId: scorecard.id, version: scorecard.version, channel, kind, sessionId, userId, ip: clientIp(h), userAgent },
    });
  } catch (e) {
    console.error("Could not record a scorecard hit", e);
  }
}
