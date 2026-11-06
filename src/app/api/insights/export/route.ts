import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { audit } from "@/lib/audit";
import { getBranding } from "@/lib/branding";
import { loadInsights } from "@/lib/insights-data";
import { insightsWorkbook } from "@/lib/insights-export";

/** Reports & Insights for the chosen time frame and program (?range=&from=&to=&program=) as a workbook. */
export async function GET(req: NextRequest) {
  const guard = await requireApiPermission("insights.view");
  if (guard.error) return guard.error;
  const q = req.nextUrl.searchParams;
  const data = await loadInsights({ range: q.get("range") ?? undefined, from: q.get("from") ?? undefined, to: q.get("to") ?? undefined, program: q.get("program") ?? undefined });
  const buffer = await insightsWorkbook(data, (await getBranding()).siteName);
  await audit(guard.user.id, "insights.export", "Insights", null, { timeFrame: data.frame.label, program: data.programCode ?? "all" });
  const name = `Compliance_Insights_${data.frame.label.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}${data.programCode ? `_${data.programCode}` : ""}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}"` },
  });
}
