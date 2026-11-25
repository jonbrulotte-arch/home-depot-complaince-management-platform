import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { audit } from "@/lib/audit";
import { getBranding } from "@/lib/branding";
import { loadInsights } from "@/lib/insights-data";
import { loadCancellations } from "@/lib/cancellations-data";
import { CANCEL_SOURCE_LABELS, cancelFrame, filterCancellations, type CancelSource } from "@/lib/cancellations";
import { cancellationsWorkbook } from "@/lib/cancellations-export";

const LABELS: Record<string, string> = { source: "Source", team: "Team responsible", dc: "Destination", sku: "SKU", scope: "Cancelled", dispute: "Dispute", q: "Search" };

/** Reports & Insights › Cancellations as a workbook, with the page's time frame, program and the tab's filters */
export async function GET(req: NextRequest) {
  const guard = await requireApiPermission("insights.view");
  if (guard.error) return guard.error;
  const q = req.nextUrl.searchParams;
  const get = (k: string) => q.get(k)?.trim().slice(0, 100) || undefined;
  const data = await loadInsights({ range: get("range"), from: get("from"), to: get("to"), program: get("program") });
  const f = { source: get("source"), team: get("team"), dc: get("dc"), sku: get("sku"), scope: get("scope"), dispute: get("dispute"), q: get("q") };
  const rows = filterCancellations(await loadCancellations(), { ...f, ...cancelFrame(data.frame), program: data.programCode });
  const shown = Object.entries(f)
    .filter(([, v]) => v)
    .map(([k, v]): [string, string] => [LABELS[k], k === "source" ? (CANCEL_SOURCE_LABELS[v as CancelSource] ?? v!) : v!]);
  const programName = data.programs.find((p) => p.code === data.programCode)?.name ?? null;
  const buffer = await cancellationsWorkbook(rows, { timeFrame: data.frame.label, program: programName, filters: shown }, (await getBranding()).siteName);
  await audit(guard.user.id, "insights.cancellationsExport", "Insights", null, { timeFrame: data.frame.label, program: data.programCode ?? "all", rows: rows.length, ...Object.fromEntries(shown) });
  const name = `Cancellations_${data.frame.label.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}${data.programCode ? `_${data.programCode}` : ""}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" },
  });
}
