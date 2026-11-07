import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, parseJson, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { roleSchema } from "@/lib/validation";

export async function PATCH(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("admin.rbac");
  if (guard.error) return guard.error;
  const { id } = await params;
  const body = await parseJson(req, roleSchema.partial());
  if (body.error) return body.error;

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) return notFound("Role not found");
  // The Admin role always keeps every permission so the platform cannot be locked out
  if (role.system && role.name === "Admin" && (body.data.permissions || body.data.name)) {
    return badRequest("The Admin role's name and permissions cannot be changed");
  }
  if (body.data.name && body.data.name !== role.name && (await prisma.role.findUnique({ where: { name: body.data.name } }))) {
    return badRequest("A role with that name already exists");
  }
  await prisma.role.update({
    where: { id },
    data: { ...body.data, ...(body.data.permissions ? { permissions: [...new Set(body.data.permissions)] } : {}) },
  });
  await audit(guard.user.id, "role.update", "Role", id, body.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("admin.rbac");
  if (guard.error) return guard.error;
  const { id } = await params;
  const role = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!role) return notFound("Role not found");
  if (role.system) return badRequest("Built-in roles cannot be deleted");
  if (role._count.users) return badRequest("Reassign this role's users before deleting it");
  await prisma.role.delete({ where: { id } });
  await audit(guard.user.id, "role.delete", "Role", id, { name: role.name });
  return NextResponse.json({ ok: true });
}
