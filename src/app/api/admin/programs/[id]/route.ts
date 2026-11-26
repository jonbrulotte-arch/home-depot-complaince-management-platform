import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, parseJson, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { parseVendorNumbers, vendorConflicts } from "@/lib/vendor-numbers";

const patchSchema = z.object({
  /** THD vendor numbers (POM's Vendor #, SPM's M-Vendor) that supply the program */
  vendorNumbers: z.array(z.string().trim().max(20)).max(100),
});

export async function PATCH(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("admin.programs");
  if (guard.error) return guard.error;
  const { id } = await params;
  const body = await parseJson(req, patchSchema);
  if (body.error) return body.error;
  const program = await prisma.program.findUnique({ where: { id }, select: { id: true, vendorNumbers: true } });
  if (!program) return notFound("Program not found");
  const { numbers, invalid } = parseVendorNumbers(body.data.vendorNumbers);
  if (invalid.length) return badRequest(`Vendor numbers are digits only: ${invalid.slice(0, 5).join(", ")}`);
  // A vendor number tells which program an order is for, so it can belong to one program only
  const others = await prisma.program.findMany({ where: { id: { not: id } }, select: { name: true, vendorNumbers: true } });
  const taken = vendorConflicts(numbers, others);
  if (taken.length) return badRequest(taken.map((t) => `Vendor ${t.vendor} is already on ${t.program}`).join("; "));
  await prisma.program.update({ where: { id }, data: { vendorNumbers: numbers } });
  await audit(guard.user.id, "program.vendors", "Program", id, { from: program.vendorNumbers, to: numbers });
  return NextResponse.json({ ok: true, vendorNumbers: numbers });
}
