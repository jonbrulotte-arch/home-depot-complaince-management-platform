import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, Paperclip } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePagePermission } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { getTimeZone } from "@/lib/time-zone-server";
import { formatDateTime } from "@/lib/utils";
import { EmailStatusBadge } from "@/components/logistics/emails";
import { PoLink, ShipmentLink } from "@/components/logistics/parts";

/** One email from the Logistics email log, in full: anyone with Logistics access can read it. */
export default async function LogisticsEmailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("logistics.view");
  const { id } = await params;
  const [e, tz] = await Promise.all([
    prisma.logisticsEmail.findUnique({
      where: { id },
      select: {
        id: true,
        createdAt: true,
        senderName: true,
        senderEmail: true,
        kind: true,
        selected: true,
        poNumbers: true,
        shipmentNumbers: true,
        teamName: true,
        to: true,
        cc: true,
        subject: true,
        body: true,
        requests: true,
        fileName: true,
        sent: true,
        error: true,
      },
    }),
    getTimeZone(),
  ]);
  if (!e) notFound();
  const isPo = e.kind === "po";
  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[7rem_1fr] gap-3 py-1.5">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900 break-words">{value}</dd>
    </div>
  );
  const list = (xs: string[]) => (xs.length ? xs.join(", ") : <span className="text-gray-400">—</span>);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/logistics?tab=emails" className="inline-flex items-center text-xs text-gray-500 hover:text-gray-700">
          <ChevronLeft className="h-4 w-4" /> Logistics › Emails
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{e.subject}</h1>
          <EmailStatusBadge sent={e.sent} />
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {e.sent ? "Sent" : "Tried"} {formatDateTime(e.createdAt, tz)} by {e.senderName}
        </p>
      </div>

      {!e.sent && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          This email wasn&apos;t sent{e.error ? `: ${e.error}` : "."} Nothing was noted on its POs or shipments.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Email</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-gray-100">
                {row(
                  "From",
                  <>
                    {e.senderName} <span className="text-gray-500">&lt;{e.senderEmail}&gt;</span>
                    <span className="block text-xs text-gray-500">Sent from the platform&apos;s mailbox; replies go to {e.senderName}.</span>
                  </>,
                )}
                {e.teamName && row("Team", e.teamName)}
                {row("To", list(e.to))}
                {row("Cc", list(e.cc))}
                {row("Subject", e.subject)}
                {row("Requests", e.requests.length ? e.requests.join("; ") : <span className="text-gray-400">None ticked</span>)}
                {row(
                  "Attachment",
                  <a href={`/api/logistics/email/${e.id}/attachment`} className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:underline">
                    <Paperclip className="h-4 w-4 text-gray-400" />
                    {e.fileName}
                    <Download className="h-3.5 w-3.5" />
                  </a>,
                )}
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Message</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-800">{e.body}</div>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>About</CardTitle>
              <p className="text-sm text-gray-500">
                {e.selected.length} {isPo ? "PO" : "shipment"}
                {e.selected.length === 1 ? "" : "s"} selected when it was sent.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-gray-500">{isPo ? "POs selected" : "Shipments selected"}</p>
                <ul className="space-y-1 text-sm">
                  {e.selected.map((n) => (
                    <li key={n}>{isPo ? <PoLink po={n} /> : <ShipmentLink number={n} />}</li>
                  ))}
                </ul>
              </div>
              {(isPo ? e.shipmentNumbers : e.poNumbers).length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-gray-500">{isPo ? "Their TMS shipments" : "Our POs on them"}</p>
                  <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    {(isPo ? e.shipmentNumbers : e.poNumbers).map((n) => (
                      <li key={n}>{isPo ? <ShipmentLink number={n} /> : <PoLink po={n} />}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
