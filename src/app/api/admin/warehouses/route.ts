import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { cleanPrefix } from "@/lib/logistics/warehouses";

const warehouseSchema = z.object({
  /** The start of the WMS OrderNumber, e.g. "3-" */
  prefix: z.string().trim().min(1, "Enter the OrderNumber prefix").max(20).transform(cleanPrefix),
  name: z.string().trim().min(1, "Enter a name").max(80),
  /** On packing slips: the name and address it ships from */
  shipFromName: z.string().trim().max(120).optional(),
  address: z.string().max(500).transform((s) => s.trim()).optional(),
});

/** Adds a warehouse (Admin › Settings › Warehouses), at the end of the list. */
export async function POST(req: Request) {
  const guard = await requireApiPermission("admin.settings");
  if (guard.error) return guard.error;
  const body = await parseJson(req, warehouseSchema);
  if (body.error) return body.error;
  const all = await prisma.warehouse.findMany({ select: { prefix: true, name: true, sortOrder: true } });
  if (all.some((w) => w.prefix === body.data.prefix)) return badRequest(`A warehouse already uses the prefix ${body.data.prefix}`);
  if (all.some((w) => w.name.toLowerCase() === body.data.name.toLowerCase())) return badRequest("A warehouse with that name already exists");
  const w = await prisma.warehouse.create({ data: { ...body.data, shipFromName: body.data.shipFromName || null, address: body.data.address || null, sortOrder: Math.max(0, ...all.map((x) => x.sortOrder)) + 10 }, select: { id: true } });
  await audit(guard.user.id, "settings.warehouseAdd", "Warehouse", w.id, body.data);
  return NextResponse.json(w, { status: 201 });
}
