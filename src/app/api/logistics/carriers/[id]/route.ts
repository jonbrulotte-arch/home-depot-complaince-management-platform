import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { notFound, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";

export async function DELETE(_req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("logistics.manage");
  if (guard.error) return guard.error;
  const carrier = await prisma.carrierLink.findUnique({ where: { id: (await params).id } });
  if (!carrier) return notFound("Carrier not found");
  await prisma.carrierLink.delete({ where: { id: carrier.id } });
  await audit(guard.user.id, "logistics.carrierDelete", "CarrierLink", carrier.id, { scac: carrier.scac });
  return NextResponse.json({ ok: true });
}
