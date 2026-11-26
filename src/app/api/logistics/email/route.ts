import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, parseJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getBranding } from "@/lib/branding";
import { MailError, sendMail } from "@/lib/mail";
import { loadLogistics, selectItems } from "@/lib/logistics/data";
import { EDI_ISSUE_TYPES, MAX_SELECTION, textToHtml } from "@/lib/logistics/edi";
import { mergeAddresses, parseAddresses } from "@/lib/email-address";
import { logisticsReportFileName, logisticsReportPdf } from "@/lib/logistics/report-pdf";
import { getTimeZone } from "@/lib/time-zone-server";
import { emailSubjects } from "@/lib/logistics/email-summary";

const schema = z.object({
  kind: z.enum(["po", "shipment"]),
  ids: z.array(z.string().trim().min(1).max(40)).min(1, "Select at least one PO or shipment").max(MAX_SELECTION),
  types: z.array(z.string()).max(20),
  /** A team's key (Admin › Teams): its To and Cc addresses are added on the server */
  team: z.string().trim().max(60).nullish(),
  to: z.string().trim().max(2000).optional(),
  cc: z.string().trim().max(2000).optional(),
  subject: z.string().trim().min(1, "Enter a subject").max(250),
  body: z.string().trim().min(1, "Write the message").max(20000),
});

/** Emails a team (and/or any addresses typed) about selected POs or shipments, with the Logistics report PDF attached. */
export async function POST(req: Request) {
  const guard = await requireApiPermission("logistics.manage");
  if (guard.error) return guard.error;
  const parsed = await parseJson(req, schema);
  if (parsed.error) return parsed.error;
  const { kind, ids, types, subject, body } = parsed.data;
  const typedTo = parseAddresses(parsed.data.to ?? "");
  const typedCc = parseAddresses(parsed.data.cc ?? "");
  if (!typedTo) return badRequest("Check the To addresses (separate them with commas)");
  if (!typedCc) return badRequest("Check the Cc addresses (separate them with commas)");
  // The team's addresses come from the database, not the browser
  const team = parsed.data.team ? await prisma.team.findUnique({ where: { key: parsed.data.team }, select: { key: true, name: true, emailTo: true, emailCc: true } }) : null;
  if (parsed.data.team && !team) return badRequest("That team no longer exists");
  const to = mergeAddresses(team?.emailTo ?? [], typedTo);
  const cc = mergeAddresses(team?.emailCc ?? [], typedCc).filter((a) => !to.some((t) => t.toLowerCase() === a.toLowerCase()));
  if (!to.length) return badRequest(team ? `${team.name} has no To address: enter one in To, or add one under Admin › Teams` : "Choose a team or enter an address in To");
  const typeLabels = EDI_ISSUE_TYPES.filter((t) => types.includes(t.key)).map((t) => t.label);

  const l = await loadLogistics();
  const { pos, shipments } = selectItems(l, kind, [...new Set(ids)]);
  if (!pos.length && !shipments.length) return badRequest("None of the selected POs or shipments is in Logistics any more");
  const count = pos.length || shipments.length;
  const fileName = logisticsReportFileName(kind, count, l.today);
  const { siteName } = await getBranding();
  const pdf = await logisticsReportPdf({ kind, pos, shipments, by: guard.user.name, timeZone: await getTimeZone(), siteName });

  // Every attempt goes in the email log, sent or not, with what was attached
  const log = (sent: boolean, error: string | null) =>
    prisma.logisticsEmail.create({
      data: {
        senderId: guard.user.id,
        senderName: guard.user.name,
        senderEmail: guard.user.email,
        kind,
        ...emailSubjects(kind, pos, shipments),
        teamKey: team?.key ?? null,
        teamName: team?.name ?? null,
        to,
        cc,
        subject,
        body,
        requests: typeLabels,
        fileName,
        attachment: new Uint8Array(pdf),
        sent,
        error,
      },
      select: { id: true },
    });

  try {
    await sendMail({
      to,
      cc,
      replyTo: guard.user.email,
      subject,
      html: textToHtml(body),
      attachments: [{ name: fileName, contentType: "application/pdf", bytes: new Uint8Array(pdf) }],
      saveToSentItems: true,
    });
  } catch (e) {
    const failed = await log(false, e instanceof Error ? e.message : String(e));
    await audit(guard.user.id, "logistics.email", "LogisticsEmail", failed.id, { kind, count, team: team?.name ?? null, to, cc, sent: false, error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: e instanceof MailError ? e.message : "The email couldn't be sent" }, { status: 502 });
  }

  const email = await log(true, null);
  // A note on each PO or shipment, so the request shows where people look
  const note = `Emailed ${team ? `${team.name} (${to.join(", ")})` : to.join(", ")}${typeLabels.length ? `: ${typeLabels.join("; ")}` : ""}. Subject: ${subject}`;
  await prisma.logisticsNote.createMany({
    data: kind === "po" ? pos.map((p) => ({ poNumber: p.poNumber, body: note, authorId: guard.user.id })) : shipments.map((s) => ({ shipmentNumber: s.shipmentNumber, body: note, authorId: guard.user.id })),
  });
  await audit(guard.user.id, "logistics.email", "LogisticsEmail", email.id, { kind, count, team: team?.name ?? null, ids: (kind === "po" ? pos.map((p) => p.poNumber) : shipments.map((s) => s.shipmentNumber)).slice(0, 50), to, cc, types: typeLabels, subject, sent: true });
  return NextResponse.json({ sent: count, to, id: email.id });
}
