import { prisma } from "@/lib/prisma";
import { poNumberVariants } from "@/lib/issues";

// The Logistics email log (LogisticsEmail): every Send Email, sent or failed, with the POs and
// shipments it concerns so PO pages, shipment pages and the violation review can list it.

export const EMAIL_SUMMARY_SELECT = {
  id: true,
  createdAt: true,
  senderName: true,
  kind: true,
  selected: true,
  teamName: true,
  to: true,
  cc: true,
  subject: true,
  requests: true,
  sent: true,
  error: true,
} as const;

/** Emails about a PO (number with or without leading zeros) or a shipment, newest first */
export function emailsFor(where: { po?: string; shipment?: string }) {
  return prisma.logisticsEmail.findMany({
    where: where.po ? { poNumbers: { hasSome: poNumberVariants(where.po.trim().toUpperCase()) } } : { shipmentNumbers: { has: where.shipment ?? "" } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: EMAIL_SUMMARY_SELECT,
  });
}

export type EmailSummary = Awaited<ReturnType<typeof emailsFor>>[number];

/** The email log for the Emails tab: search by PO, shipment, subject, recipient, team or sender; sent, failed or all */
export async function emailLog(f: { q?: string; status?: string }) {
  const q = f.q?.trim();
  const where = {
    ...(f.status === "sent" ? { sent: true } : f.status === "failed" ? { sent: false } : {}),
    ...(q
      ? {
          OR: [
            { poNumbers: { hasSome: poNumberVariants(q.toUpperCase()) } },
            { shipmentNumbers: { has: q } },
            { subject: { contains: q, mode: "insensitive" as const } },
            { teamName: { contains: q, mode: "insensitive" as const } },
            { senderName: { contains: q, mode: "insensitive" as const } },
            { to: { has: q.toLowerCase() } },
            { cc: { has: q.toLowerCase() } },
            { body: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [emails, total] = await Promise.all([prisma.logisticsEmail.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, select: EMAIL_SUMMARY_SELECT }), prisma.logisticsEmail.count({ where })]);
  return { emails, total };
}
