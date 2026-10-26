import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "must be at least 8 characters").max(200),
  roleId: z.string().trim().min(1),
});

export async function POST(req: Request) {
  const guard = await requireApiPermission("admin.users");
  if (guard.error) return guard.error;
  const body = await parseJson(req, createSchema);
  if (body.error) return body.error;
  const { password, ...data } = body.data;

  if (!(await prisma.role.findUnique({ where: { id: data.roleId } }))) return badRequest("Unknown role");
  if (await prisma.user.findUnique({ where: { email: data.email } })) return badRequest("A user with that email already exists");
  const user = await prisma.user.create({ data: { ...data, passwordHash: await bcrypt.hash(password, 12) } });
  await audit(guard.user.id, "user.create", "User", user.id, { email: user.email, roleId: user.roleId });
  return NextResponse.json({ id: user.id }, { status: 201 });
}
