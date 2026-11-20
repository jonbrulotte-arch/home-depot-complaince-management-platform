import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { notFound, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";

/** Deletes a note: its author, or someone who manages logistics. */
export async function DELETE(_req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("logistics.view");
  if (guard.error) return guard.error;
  const note = await prisma.logisticsNote.findUnique({ where: { id: (await params).id } });
  if (!note) return notFound("Note not found");
  if (note.authorId !== guard.user.id && !guard.user.permissions.has("logistics.manage")) return NextResponse.json({ error: "Only the note's author can delete it" }, { status: 403 });
  await prisma.logisticsNote.delete({ where: { id: note.id } });
  await audit(guard.user.id, "logistics.noteDelete", "LogisticsNote", note.id, { po: note.poNumber, shipment: note.shipmentNumber });
  return NextResponse.json({ ok: true });
}
