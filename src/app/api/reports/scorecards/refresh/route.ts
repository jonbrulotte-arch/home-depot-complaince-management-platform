import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { refreshPublishedScorecards } from "@/lib/scorecard-refresh";

/**
 * Rebuilds every published scorecard from the current data and replaces those that changed,
 * keeping them published (same publish date and public link, new version).
 */
export async function POST() {
  const guard = await requireApiPermission("reports.advance");
  if (guard.error) return guard.error;
  return NextResponse.json(await refreshPublishedScorecards(guard.user.id));
}
