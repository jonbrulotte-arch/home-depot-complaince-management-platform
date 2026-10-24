import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, parseJson, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  roleId: z.string().trim().min(1).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8, "must be at least 8 characters").max(200).optional(),
});

export async function PATCH(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("admin.users");
  if (guard.error) return guard.error;
  const { id } = await params;
  const body = await parseJson(req, patchSchema);
  if (body.error) return body.error;
  const { password, ...data } = body.data;

  if (!(await prisma.user.findUnique({ where: { id } }))) return notFound("User not found");
  if (id === guard.user.id && (data.active === false || data.roleId)) {
    return badRequest("You cannot deactivate yourself or change your own role");
  }
  if (data.roleId && !(await prisma.role.findUnique({ where: { id: data.roleId } }))) return badRequest("Unknown role");

  await prisma.user.update({
    where: { id },
    data: { ...data, ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}) },
  });
  await audit(guard.user.id, "user.update", "User", id, { ...data, passwordChanged: Boolean(password) });
  return NextResponse.json({ ok: true });
}
