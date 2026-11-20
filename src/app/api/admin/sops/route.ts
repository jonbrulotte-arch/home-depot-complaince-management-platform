import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest } from "@/lib/api";
import { audit } from "@/lib/audit";
import { sopFileName, sopForm } from "@/lib/sops";

/** Uploads an SOP PDF for the roles chosen (multipart: file, title, roleIds as a JSON list). */
export async function POST(req: Request) {
  const guard = await requireApiPermission("admin.settings");
  if (guard.error) return guard.error;
  const form = await req.formData().catch(() => null);
  if (!form) return badRequest("Send the SOP as a form upload");
  const roles = await prisma.role.findMany({ select: { id: true } });
  const parsed = await sopForm(form, roles.map((r) => r.id));
  if (parsed.error) return badRequest(parsed.error);
  if (!parsed.file) return badRequest("Choose the SOP's PDF");
  if (!parsed.title) return badRequest("Give the SOP a title");
  const last = await prisma.sopDocument.aggregate({ _max: { sortOrder: true } });
  const sop = await prisma.sopDocument.create({
    data: {
      title: parsed.title,
      fileName: sopFileName(parsed.file.name),
      size: parsed.file.bytes.length,
      data: parsed.file.bytes,
      roleIds: parsed.roleIds ?? [],
      sortOrder: (last._max.sortOrder ?? 0) + 10,
      uploadedById: guard.user.id,
    },
    select: { id: true },
  });
  await audit(guard.user.id, "sop.upload", "SopDocument", sop.id, { title: parsed.title, size: parsed.file.bytes.length, roles: parsed.roleIds?.length ?? 0 });
  return NextResponse.json(sop, { status: 201 });
}
