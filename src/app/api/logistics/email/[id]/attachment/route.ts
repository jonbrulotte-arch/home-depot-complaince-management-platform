import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { notFound, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";

/** The report PDF attached to a Logistics email, as it was sent. */
export async function GET(_req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("logistics.view");
  if (guard.error) return guard.error;
  const { id } = await params;
  const e = await prisma.logisticsEmail.findUnique({ where: { id }, select: { fileName: true, attachment: true, subject: true } });
  if (!e) return notFound("Email not found");
  await audit(guard.user.id, "logistics.emailAttachment", "LogisticsEmail", id, { fileName: e.fileName, subject: e.subject });
  return new Response(new Uint8Array(e.attachment), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${e.fileName.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
