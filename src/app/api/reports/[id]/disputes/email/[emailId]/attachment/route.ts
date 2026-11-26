import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { notFound } from "@/lib/api";
import { audit } from "@/lib/audit";

/** The dispute report PDF attached to an email from a report's Disputes page, as it was sent. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; emailId: string }> }) {
  const guard = await requireApiPermission("reports.view");
  if (guard.error) return guard.error;
  const { id, emailId } = await params;
  const e = await prisma.disputeEmail.findFirst({ where: { id: emailId, reportId: id }, select: { fileName: true, attachment: true, subject: true } });
  if (!e) return notFound("Email not found");
  await audit(guard.user.id, "disputes.emailAttachment", "DisputeEmail", emailId, { reportId: id, fileName: e.fileName, subject: e.subject });
  return new Response(new Uint8Array(e.attachment), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${e.fileName.replace(/[^\w.-]/g, "_")}"`, "Cache-Control": "private, no-store" },
  });
}
