import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { audit } from "@/lib/audit";
import { getBranding } from "@/lib/branding";
import { loadLogistics } from "@/lib/logistics/data";
import { asnConfirmationWorkbook, asnExportFileName } from "@/lib/logistics/asn-export";
import { filterPos, sortPos } from "@/lib/logistics/views";

/** The ASN/Shipped Confirmation file for the POs as filtered and sorted on the POs tab */
export async function GET(req: NextRequest) {
  const guard = await requireApiPermission("logistics.view");
  if (guard.error) return guard.error;
  const sp = req.nextUrl.searchParams;
  const get = (k: string) => sp.get(k) ?? undefined;
  const l = await loadLogistics();
  const pos = sortPos(
    filterPos(l.pos, { q: get("q"), status: get("status"), flag: get("flag"), severity: get("severity"), scac: get("scac"), wh: get("wh"), ch: get("ch"), asn: get("asn"), esd: get("esd"), range: get("range"), from: get("from"), to: get("to") }, l.today),
    get("sort"),
    l.warehouses,
  );
  const buffer = await asnConfirmationWorkbook(pos, (await getBranding()).siteName);
  await audit(guard.user.id, "logistics.asnExport", "Logistics", null, { pos: pos.length });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${asnExportFileName(l.today)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
