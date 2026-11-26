import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";

const schema = z.object({
  poNumber: z.string().trim().max(40).optional(),
  shipmentNumber: z.string().trim().max(40).optional(),
  body: z.string().trim().min(1, "Write the note").max(5000),
});

/** Adds a note to a PO or a TMS shipment. */
export async function POST(req: Request) {
  const guard = await requireApiPermission("logistics.view");
  if (guard.error) return guard.error;
  const parsed = await parseJson(req, schema);
  if (parsed.error) return parsed.error;
  const { poNumber, shipmentNumber, body } = parsed.data;
  if (!poNumber === !shipmentNumber) return badRequest("Give a PO number or a shipment number");
  const note = await prisma.logisticsNote.create({ data: { poNumber: poNumber || null, shipmentNumber: shipmentNumber || null, body, authorId: guard.user.id }, select: { id: true } });
  await audit(guard.user.id, "logistics.note", "LogisticsNote", note.id, { po: poNumber, shipment: shipmentNumber });
  return NextResponse.json(note, { status: 201 });
}
