import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { badRequest, notFound, parseJson, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getBranding } from "@/lib/branding";
import { MailError, sendMail } from "@/lib/mail";
import { mergeAddresses, parseAddresses } from "@/lib/email-address";
import { textToHtml } from "@/lib/logistics/edi";
import { DISPUTE_REQUESTS, MAX_DISPUTE_SELECTION, disputeReportFileName } from "@/lib/dispute-email";
import { loadDisputesForEmail } from "@/lib/dispute-email-data";
import { disputeReportPdf } from "@/lib/dispute-report-pdf";
import { getTimeZone } from "@/lib/time-zone-server";

const schema = z.object({
  ids: z.array(z.string().trim().min(1).max(40)).min(1, "Select at least one dispute").max(MAX_DISPUTE_SELECTION),
  types: z.array(z.string()).max(20),
  /** A team's key (Admin › Teams): its To and Cc addresses are added on the server */
  team: z.string().trim().max(60).nullish(),
  to: z.string().trim().max(2000).optional(),
  cc: z.string().trim().max(2000).optional(),
  subject: z.string().trim().min(1, "Enter a subject").max(250),
  body: z.string().trim().min(1, "Write the message").max(20000),
});

/** Emails a team (and/or any addresses typed) about selected disputes, with the dispute report PDF attached. */
export async function POST(req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("disputes.manage");
  if (guard.error) return guard.error;
  const { id } = await params;
  const parsed = await parseJson(req, schema);
  if (parsed.error) return parsed.error;
  const { types, subject, body } = parsed.data;
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
  const requests = DISPUTE_REQUESTS.filter((t) => types.includes(t.key)).map((t) => t.label);

  const data = await loadDisputesForEmail(id, parsed.data.ids);
  if (!data) return notFound("Report not found");
  const { disputes } = data;
  if (!disputes.length) return badRequest("None of the selected disputes belongs to this report");
  const tz = await getTimeZone();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const fileName = disputeReportFileName(disputes.length, today);
  const pdf = await disputeReportPdf({ reportTitle: data.report.title, disputes, teams: data.teams, by: guard.user.name, timeZone: tz, windowCloses: data.report.period.disputeClose, siteName: (await getBranding()).siteName, pom: data.pom });

  // Every attempt goes in the report's email log, sent or not, with what was attached
  const log = (sent: boolean, error: string | null) =>
    prisma.disputeEmail.create({
      data: {
        reportId: id,
        senderId: guard.user.id,
        senderName: guard.user.name,
        senderEmail: guard.user.email,
        disputeIds: disputes.map((d) => d.id),
        poNumbers: [...new Set(disputes.flatMap((d) => (d.line.poNumber ? [d.line.poNumber] : [])))],
        teamKey: team?.key ?? null,
        teamName: team?.name ?? null,
        to,
        cc,
        subject,
        body,
        requests,
        fileName,
        attachment: new Uint8Array(pdf),
        sent,
        error,
      },
      select: { id: true },
    });

  try {
    await sendMail({ to, cc, replyTo: guard.user.email, subject, html: textToHtml(body), attachments: [{ name: fileName, contentType: "application/pdf", bytes: new Uint8Array(pdf) }], saveToSentItems: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const failed = await log(false, message);
    await audit(guard.user.id, "disputes.email", "DisputeEmail", failed.id, { reportId: id, count: disputes.length, team: team?.name ?? null, to, cc, sent: false, error: message });
    return NextResponse.json({ error: e instanceof MailError ? e.message : "The email couldn't be sent" }, { status: 502 });
  }

  const email = await log(true, null);
  // A note on each dispute's timeline, so the request shows where people work
  const note = `Emailed ${team ? `${team.name} (${to.join(", ")})` : to.join(", ")}${requests.length ? `: ${requests.join("; ")}` : ""}. Subject: ${subject}`;
  await prisma.disputeEvent.createMany({ data: disputes.map((d) => ({ disputeId: d.id, type: "NOTE" as const, body: note, userId: guard.user.id })) });
  await audit(guard.user.id, "disputes.email", "DisputeEmail", email.id, { reportId: id, count: disputes.length, team: team?.name ?? null, to, cc, requests, subject, sent: true });
  return NextResponse.json({ sent: disputes.length, to, id: email.id });
}
