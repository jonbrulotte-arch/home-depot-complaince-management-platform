import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { roleSchema } from "@/lib/validation";

export async function POST(req: Request) {
  const guard = await requireApiPermission("admin.rbac");
  if (guard.error) return guard.error;
  const body = await parseJson(req, roleSchema);
  if (body.error) return body.error;
  if (await prisma.role.findUnique({ where: { name: body.data.name } })) return badRequest("A role with that name already exists");
  const role = await prisma.role.create({ data: { ...body.data, permissions: [...new Set(body.data.permissions)] } });
  await audit(guard.user.id, "role.create", "Role", role.id, body.data);
  return NextResponse.json({ id: role.id }, { status: 201 });
}
