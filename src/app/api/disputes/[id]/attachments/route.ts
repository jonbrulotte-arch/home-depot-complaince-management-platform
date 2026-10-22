import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { ATTACHMENT_EXTENSIONS, MAX_ATTACHMENT_BYTES } from "@/lib/disputes";

export async function POST(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("disputes.manage");
  if (guard.error) return guard.error;
  const { id } = await params;
  if (!(await prisma.dispute.findUnique({ where: { id }, select: { id: true } }))) return notFound("Dispute not found");

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return badRequest("Attach a file in the \"file\" field");
  if (!ATTACHMENT_EXTENSIONS.test(file.name)) return badRequest("Allowed: PDF, images, Excel/CSV, Word, Outlook .msg/.eml and text files");
  if (file.size > MAX_ATTACHMENT_BYTES) return badRequest("Attachments are limited to 10 MB");
  const fileName = file.name.replace(/[\\/\r\n"]/g, "_").slice(0, 200);

  const attachment = await prisma.disputeAttachment.create({
    data: {
      disputeId: id,
      fileName,
      contentType: file.type || "application/octet-stream",
      size: file.size,
      data: Buffer.from(await file.arrayBuffer()),
      uploadedById: guard.user.id,
    },
    select: { id: true },
  });
  await prisma.disputeEvent.create({ data: { disputeId: id, type: "ATTACHMENT", body: `Attached ${fileName}`, userId: guard.user.id } });
  await audit(guard.user.id, "dispute.attach", "Dispute", id, { attachmentId: attachment.id, fileName, size: file.size });
  return NextResponse.json({ id: attachment.id }, { status: 201 });
}
