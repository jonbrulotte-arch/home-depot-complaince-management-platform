import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { audit } from "@/lib/audit";
import { fetchWmsReport } from "@/lib/logistics/import";

/** Pulls the WMS "shipped last 60 days" report from WMS_REPORT_URL and imports it. */
export async function POST() {
  const guard = await requireApiPermission("logistics.manage");
  if (guard.error) return guard.error;
  try {
    const result = await fetchWmsReport(guard.user.id);
    await audit(guard.user.id, "logistics.fetchWms", "LogisticsImport", result.importId, { rows: result.rows, created: result.created, updated: result.updated });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't pull the WMS report" }, { status: 502 });
  }
}
