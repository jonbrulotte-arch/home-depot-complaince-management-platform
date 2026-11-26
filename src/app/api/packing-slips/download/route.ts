import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/auth-guard";
import { parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getBranding } from "@/lib/branding";
import { slipFileName, slipSchema, totalUnits } from "@/lib/packing-slip";
import { rememberDestination } from "@/lib/packing-slip-data";
import { packingSlipPdf, packingSlipXlsx } from "@/lib/packing-slip-pdf";

const bodySchema = z.object({ slip: slipSchema, format: z.enum(["pdf", "xlsx"]) });

/** The slip as edited, as a PDF or Excel file; remembers the destination's address for the next slip */
export async function POST(req: NextRequest) {
  const guard = await requireApiPermission("packingslips.use");
  if (guard.error) return guard.error;
  const body = await parseJson(req, bodySchema);
  if (body.error) return body.error;
  const { slip, format } = body.data;
  if (!slip.items.length) return NextResponse.json({ error: "Add at least one item" }, { status: 400 });
  await rememberDestination(slip, guard.user.id);
  const { siteName } = await getBranding();
  await audit(guard.user.id, "packingslip.download", "PackingSlip", null, { poNumber: slip.poNumber, format, items: slip.items.length, units: totalUnits(slip.items) });
  const buffer = format === "xlsx" ? await packingSlipXlsx(slip, siteName) : await packingSlipPdf(slip, siteName);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
      "Content-Disposition": `attachment; filename="${slipFileName(slip.poNumber, format)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
