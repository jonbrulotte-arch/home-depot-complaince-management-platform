import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getBranding } from "@/lib/branding";
import { MailError, sendMail } from "@/lib/mail";
import { loadLogistics, selectItems } from "@/lib/logistics/data";
import { EDI_ISSUE_TYPES, MAX_SELECTION, parseAddresses, textToHtml } from "@/lib/logistics/edi";
import { logisticsReportFileName, logisticsReportPdf } from "@/lib/logistics/report-pdf";
import { getTimeZone } from "@/lib/time-zone-server";

const schema = z.object({
  kind: z.enum(["po", "shipment"]),
  ids: z.array(z.string().trim().min(1).max(40)).min(1, "Select at least one PO or shipment").max(MAX_SELECTION),
  types: z.array(z.string()).max(20),
  to: z.string().trim().min(1, "Enter the EDI team's address").max(1000),
  cc: z.string().trim().max(1000).optional(),
  subject: z.string().trim().min(1, "Enter a subject").max(250),
  body: z.string().trim().min(1, "Write the message").max(20000),
});

/** Emails the EDI team about selected POs or shipments, with the Logistics report PDF attached. */
export async function POST(req: Request) {
  const guard = await requireApiPermission("logistics.manage");
  if (guard.error) return guard.error;
  const parsed = await parseJson(req, schema);
  if (parsed.error) return parsed.error;
  const { kind, ids, types, subject, body } = parsed.data;
  const to = parseAddresses(parsed.data.to);
  const cc = parseAddresses(parsed.data.cc ?? "");
  if (!to?.length) return badRequest("Check the To addresses (separate them with commas)");
  if (!cc) return badRequest("Check the Cc addresses (separate them with commas)");
  const typeLabels = EDI_ISSUE_TYPES.filter((t) => types.includes(t.key)).map((t) => t.label);

  const l = await loadLogistics();
  const { pos, shipments } = selectItems(l, kind, [...new Set(ids)]);
  if (!pos.length && !shipments.length) return badRequest("None of the selected POs or shipments is in Logistics any more");
  const count = pos.length || shipments.length;
  const fileName = logisticsReportFileName(kind, count, l.today);
  const { siteName } = await getBranding();
  const pdf = await logisticsReportPdf({ kind, pos, shipments, by: guard.user.name, timeZone: await getTimeZone(), siteName });

  try {
    await sendMail({
      to,
      cc: cc.filter((a) => !to.includes(a)),
      replyTo: guard.user.email,
      subject,
      html: textToHtml(body),
      attachments: [{ name: fileName, contentType: "application/pdf", bytes: new Uint8Array(pdf) }],
      saveToSentItems: true,
    });
  } catch (e) {
    await audit(guard.user.id, "logistics.ediEmail", "Logistics", null, { kind, count, to, sent: false, error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: e instanceof MailError ? e.message : "The email couldn't be sent" }, { status: 502 });
  }

  // A note on each PO or shipment, so the request shows where people look
  const note = `Sent to the EDI team (${to.join(", ")})${typeLabels.length ? `: ${typeLabels.join("; ")}` : ""}. Subject: ${subject}`;
  await prisma.logisticsNote.createMany({
    data: kind === "po" ? pos.map((p) => ({ poNumber: p.poNumber, body: note, authorId: guard.user.id })) : shipments.map((s) => ({ shipmentNumber: s.shipmentNumber, body: note, authorId: guard.user.id })),
  });
  await audit(guard.user.id, "logistics.ediEmail", "Logistics", null, { kind, count, ids: (kind === "po" ? pos.map((p) => p.poNumber) : shipments.map((s) => s.shipmentNumber)).slice(0, 50), to, cc, types: typeLabels, subject, sent: true });
  return NextResponse.json({ sent: count, to });
}
