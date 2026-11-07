import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { notFound, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";

export async function DELETE(_req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("admin.programs");
  if (guard.error) return guard.error;
  const { id } = await params;
  const alias = await prisma.columnAlias.findUnique({ where: { id } });
  if (!alias) return notFound("Mapping not found");
  await prisma.columnAlias.delete({ where: { id } });
  await audit(guard.user.id, "alias.delete", "ColumnAlias", id, { sourceHeader: alias.sourceHeader, canonicalField: alias.canonicalField });
  return NextResponse.json({ ok: true });
}
