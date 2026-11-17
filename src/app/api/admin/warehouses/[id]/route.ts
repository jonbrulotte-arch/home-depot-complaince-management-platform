import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, parseJson, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { cleanPrefix } from "@/lib/logistics/warehouses";

const patchSchema = z.object({
  prefix: z.string().trim().min(1, "Enter the OrderNumber prefix").max(20).transform(cleanPrefix).optional(),
  name: z.string().trim().min(1, "Enter a name").max(80).optional(),
});

/** Changes a warehouse's prefix or name; Logistics shows the change at once (nothing is stored per carton). */
export async function PATCH(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("admin.settings");
  if (guard.error) return guard.error;
  const { id } = await params;
  const body = await parseJson(req, patchSchema);
  if (body.error) return body.error;
  const w = await prisma.warehouse.findUnique({ where: { id } });
  if (!w) return notFound("Warehouse not found");
  const { prefix, name } = body.data;
  const others = await prisma.warehouse.findMany({ where: { NOT: { id } }, select: { prefix: true, name: true } });
  if (prefix && others.some((o) => o.prefix === prefix)) return badRequest(`A warehouse already uses the prefix ${prefix}`);
  if (name && others.some((o) => o.name.toLowerCase() === name.toLowerCase())) return badRequest("A warehouse with that name already exists");
  await prisma.warehouse.update({ where: { id }, data: { ...(prefix ? { prefix } : {}), ...(name ? { name } : {}) } });
  await audit(guard.user.id, "settings.warehouseChange", "Warehouse", id, { from: { prefix: w.prefix, name: w.name }, to: { prefix: prefix ?? w.prefix, name: name ?? w.name } });
  return NextResponse.json({ ok: true });
}

/** Removes a warehouse: its POs and shipments show as an unknown warehouse until it is added again. */
export async function DELETE(_req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("admin.settings");
  if (guard.error) return guard.error;
  const { id } = await params;
  const w = await prisma.warehouse.findUnique({ where: { id } });
  if (!w) return notFound("Warehouse not found");
  await prisma.warehouse.delete({ where: { id } });
  await audit(guard.user.id, "settings.warehouseDelete", "Warehouse", id, { prefix: w.prefix, name: w.name });
  return NextResponse.json({ ok: true });
}
