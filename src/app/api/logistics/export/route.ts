import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { audit } from "@/lib/audit";
import { getBranding } from "@/lib/branding";
import { loadLogistics } from "@/lib/logistics/data";
import { logisticsWorkbook } from "@/lib/logistics/export";
import { filterPos } from "@/lib/logistics/views";

/** The POs (as filtered on the page: q, status, flag, severity, scac), their shipments and cartons as xlsx. */
export async function GET(req: NextRequest) {
  const guard = await requireApiPermission("logistics.view");
  if (guard.error) return guard.error;
  const sp = req.nextUrl.searchParams;
  const l = await loadLogistics();
  const pos = filterPos(l.pos, { q: sp.get("q") ?? undefined, status: sp.get("status") ?? undefined, flag: sp.get("flag") ?? undefined, severity: sp.get("severity") ?? undefined, scac: sp.get("scac") ?? undefined });
  const buffer = await logisticsWorkbook(l, pos, (await getBranding()).siteName);
  await audit(guard.user.id, "logistics.export", "Logistics", null, { pos: pos.length });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Logistics_${l.today}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
