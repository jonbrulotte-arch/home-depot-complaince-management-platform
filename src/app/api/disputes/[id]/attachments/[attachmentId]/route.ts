import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { notFound } from "@/lib/api";
import { audit } from "@/lib/audit";

type Params = { params: Promise<{ id: string; attachmentId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const guard = await requireApiPermission("reports.view");
  if (guard.error) return guard.error;
  const { id, attachmentId } = await params;
  const file = await prisma.disputeAttachment.findFirst({ where: { id: attachmentId, disputeId: id } });
  if (!file) return notFound("Attachment not found");
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      // Always download rather than render, so uploaded HTML/SVG can never run in our origin
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${file.fileName.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  const guard = await requireApiPermission("disputes.manage");
  if (guard.error) return guard.error;
  const { id, attachmentId } = await params;
  const file = await prisma.disputeAttachment.findFirst({ where: { id: attachmentId, disputeId: id }, select: { id: true, fileName: true } });
  if (!file) return notFound("Attachment not found");
  await prisma.disputeAttachment.delete({ where: { id: file.id } });
  await prisma.disputeEvent.create({ data: { disputeId: id, type: "ATTACHMENT", body: `Removed ${file.fileName}`, userId: guard.user.id } });
  await audit(guard.user.id, "dispute.detach", "Dispute", id, { attachmentId, fileName: file.fileName });
  return NextResponse.json({ ok: true });
}
