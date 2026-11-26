import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { audit } from "@/lib/audit";
import { getBranding } from "@/lib/branding";
import { loadLogistics, selectItems } from "@/lib/logistics/data";
import { MAX_SELECTION } from "@/lib/logistics/edi";
import { logisticsWorkbook } from "@/lib/logistics/export";
import { logisticsReportFileName, logisticsReportPdf } from "@/lib/logistics/report-pdf";
import { getTimeZone } from "@/lib/time-zone-server";

/** The report for selected POs or shipments: ?kind=po|shipment&ids=a,b&format=pdf|xlsx */
export async function GET(req: NextRequest) {
  const guard = await requireApiPermission("logistics.view");
  if (guard.error) return guard.error;
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind") === "shipment" ? "shipment" : "po";
  const ids = [...new Set((sp.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, MAX_SELECTION);
  const l = await loadLogistics();
  const { pos, shipments } = selectItems(l, kind, ids);
  if (!pos.length && !shipments.length) return NextResponse.json({ error: "Select at least one PO or shipment" }, { status: 400 });
  const { siteName } = await getBranding();
  const count = pos.length || shipments.length;
  await audit(guard.user.id, "logistics.report", "Logistics", null, { kind, count, format: sp.get("format") ?? "pdf" });
  if (sp.get("format") === "xlsx") {
    const ourPos = kind === "po" ? pos : l.pos.filter((p) => shipments.some((s) => s.ourPos.includes(p.poNumber)));
    const buffer = await logisticsWorkbook(l, ourPos, siteName);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${logisticsReportFileName(kind, count, l.today).replace(/\.pdf$/, ".xlsx")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  const buffer = await logisticsReportPdf({ kind, pos, shipments, by: guard.user.name, timeZone: await getTimeZone(), siteName });
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${logisticsReportFileName(kind, count, l.today)}"`, "Cache-Control": "private, no-store" },
  });
}
