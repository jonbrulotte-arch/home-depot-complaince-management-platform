import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { audit } from "@/lib/audit";
import { getBranding } from "@/lib/branding";
import { loadInsights } from "@/lib/insights-data";
import { loadCancellations } from "@/lib/cancellations-data";
import { CANCEL_SOURCE_LABELS, cancelFrame, filterCancellations, type CancelSource } from "@/lib/cancellations";
import { cancellationsWorkbook } from "@/lib/cancellations-export";
import { cancellationsPdf } from "@/lib/cancellations-pdf";
import { formatDateTime } from "@/lib/utils";
import { getTimeZone } from "@/lib/time-zone-server";

const LABELS: Record<string, string> = { source: "Source", team: "Team responsible", dc: "Destination", sku: "SKU", scope: "Cancelled", dispute: "Dispute", vendor: "Vendor # (POM)", reason: "PO reason code (POM)", q: "Search" };

/** Reports & Insights › Cancellations as a workbook (or ?format=pdf, a PDF report), with the page's time frame, program and the tab's filters */
export async function GET(req: NextRequest) {
  const guard = await requireApiPermission("insights.view");
  if (guard.error) return guard.error;
  const q = req.nextUrl.searchParams;
  const get = (k: string) => q.get(k)?.trim().slice(0, 100) || undefined;
  const data = await loadInsights({ range: get("range"), from: get("from"), to: get("to"), program: get("program") });
  const f = { source: get("source"), team: get("team"), dc: get("dc"), sku: get("sku"), scope: get("scope"), dispute: get("dispute"), vendor: get("vendor"), reason: get("reason"), q: get("q") };
  const all = await loadCancellations();
  const rows = filterCancellations(all, { ...f, ...cancelFrame(data.frame), program: data.programCode });
  // "All time" covers every cancellation recorded, including months THD has no compliance data for yet
  const frameLabel = data.frame.key === "all" ? "All time" : data.frame.label;
  const shown = Object.entries(f)
    .filter(([, v]) => v)
    .map(([k, v]): [string, string] => [LABELS[k], k === "source" ? (CANCEL_SOURCE_LABELS[v as CancelSource] ?? v!) : v!]);
  const programName = data.programs.find((p) => p.code === data.programCode)?.name ?? null;
  const pdf = q.get("format") === "pdf";
  const siteName = (await getBranding()).siteName;
  const buffer = pdf
    ? await cancellationsPdf(rows, { timeFrame: frameLabel, program: programName, filters: shown, all, by: guard.user.name, generated: formatDateTime(new Date(), await getTimeZone()) }, siteName)
    : await cancellationsWorkbook(rows, { timeFrame: frameLabel, program: programName, filters: shown, all }, siteName);
  await audit(guard.user.id, "insights.cancellationsExport", "Insights", null, { format: pdf ? "pdf" : "xlsx", timeFrame: frameLabel, program: data.programCode ?? "all", rows: rows.length, ...Object.fromEntries(shown) });
  const name = `Cancellations_${frameLabel.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}${data.programCode ? `_${data.programCode}` : ""}.${pdf ? "pdf" : "xlsx"}`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": pdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
