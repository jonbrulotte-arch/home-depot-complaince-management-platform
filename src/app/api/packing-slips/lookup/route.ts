import { NextResponse, type NextRequest } from "next/server";
import { requireApiPermission } from "@/lib/auth-guard";
import { lookupSlip } from "@/lib/packing-slip-data";

/** A packing slip filled in from the data the platform has for ?po= (404 when nothing knows the PO) */
export async function GET(req: NextRequest) {
  const guard = await requireApiPermission("packingslips.use");
  if (guard.error) return guard.error;
  const po = (req.nextUrl.searchParams.get("po") ?? "").trim().slice(0, 40);
  if (!po) return NextResponse.json({ error: "Enter a PO number" }, { status: 400 });
  const found = await lookupSlip(po);
  if (!found) return NextResponse.json({ error: `Nothing in Logistics or THD's compliance data has PO ${po}. Fill the slip in by hand.` }, { status: 404 });
  return NextResponse.json(found, { headers: { "Cache-Control": "private, no-store" } });
}
