import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { sopFileName, sopForm } from "@/lib/sops";

/** Renames an SOP, changes its roles, or replaces its PDF with a newer version (multipart; any of title, roleIds, file). */
export async function PATCH(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("admin.settings");
  if (guard.error) return guard.error;
  const { id } = await params;
  const sop = await prisma.sopDocument.findUnique({ where: { id }, select: { title: true } });
  if (!sop) return notFound("SOP not found");
  const form = await req.formData().catch(() => null);
  if (!form) return badRequest("Send the changes as a form upload");
  const roles = await prisma.role.findMany({ select: { id: true } });
  const parsed = await sopForm(form, roles.map((r) => r.id));
  if (parsed.error) return badRequest(parsed.error);
  await prisma.sopDocument.update({
    where: { id },
    // Unchecked input: uploadedById is written as the plain column
    data: {
      ...(parsed.title ? { title: parsed.title } : {}),
      ...(parsed.roleIds ? { roleIds: parsed.roleIds } : {}),
      ...(parsed.file ? { fileName: sopFileName(parsed.file.name), size: parsed.file.bytes.length, data: parsed.file.bytes, uploadedById: guard.user.id } : {}),
    } satisfies Prisma.SopDocumentUncheckedUpdateInput,
  });
  await audit(guard.user.id, "sop.update", "SopDocument", id, {
    title: parsed.title ?? sop.title,
    ...(parsed.file ? { newFile: parsed.file.name, size: parsed.file.bytes.length } : {}),
    ...(parsed.roleIds ? { roles: parsed.roleIds.length } : {}),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("admin.settings");
  if (guard.error) return guard.error;
  const { id } = await params;
  const sop = await prisma.sopDocument.findUnique({ where: { id }, select: { title: true } });
  if (!sop) return notFound("SOP not found");
  await prisma.sopDocument.delete({ where: { id } });
  await audit(guard.user.id, "sop.delete", "SopDocument", id, { title: sop.title });
  return NextResponse.json({ ok: true });
}
