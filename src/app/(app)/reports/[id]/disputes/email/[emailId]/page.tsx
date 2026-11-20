import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, Paperclip } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePagePermission } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { getTimeZone } from "@/lib/time-zone-server";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { EmailStatusBadge } from "@/components/logistics/emails";
import { DisputeStatusBadge } from "@/components/shared/status-badges";

/** One email sent from a report's Disputes page, in full: anyone who can see the report can read it. */
export default async function DisputeEmailPage({ params }: { params: Promise<{ id: string; emailId: string }> }) {
  await requirePagePermission("reports.view");
  const { id, emailId } = await params;
  const [e, tz] = await Promise.all([
    prisma.disputeEmail.findFirst({
      where: { id: emailId, reportId: id },
      select: {
        id: true,
        createdAt: true,
        senderName: true,
        senderEmail: true,
        disputeIds: true,
        teamName: true,
        to: true,
        cc: true,
        subject: true,
        body: true,
        requests: true,
        fileName: true,
        sent: true,
        error: true,
        report: { select: { title: true } },
      },
    }),
    getTimeZone(),
  ]);
  if (!e) notFound();
  const disputes = await prisma.dispute.findMany({
    where: { id: { in: e.disputeIds } },
    select: { id: true, status: true, amountDisputed: true, line: { select: { poNumber: true, metric: { select: { name: true, program: { select: { name: true } } } } } } },
  });
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
        <Link href={`/reports/${id}/disputes`} className="inline-flex items-center text-xs text-gray-500 hover:text-gray-700">
          <ChevronLeft className="h-4 w-4" /> {e.report.title} › Disputes
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
          This email wasn&apos;t sent{e.error ? `: ${e.error}` : "."} Nothing was noted on its disputes.
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
                  <a href={`/api/reports/${id}/disputes/email/${e.id}/attachment`} className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:underline">
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
        <Card className="self-start">
          <CardHeader className="pb-2">
            <CardTitle>About</CardTitle>
            <p className="text-sm text-gray-500">
              {e.disputeIds.length} dispute{e.disputeIds.length === 1 ? "" : "s"} selected when it was sent; their status now.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {disputes.map((d) => (
                <li key={d.id} className="flex items-start justify-between gap-2">
                  <span>
                    <Link href={`/reports/${id}/disputes?d=${d.id}`} className="font-medium text-blue-600 hover:underline">
                      PO {d.line.poNumber ?? "—"}
                    </Link>
                    <span className="block text-xs text-gray-500">
                      {d.line.metric.program.name} · {d.line.metric.name} · {formatCurrency(Number(d.amountDisputed))}
                    </span>
                  </span>
                  <DisputeStatusBadge status={d.status} />
                </li>
              ))}
              {disputes.length < e.disputeIds.length && <li className="text-xs text-gray-500">{e.disputeIds.length - disputes.length} dispute(s) no longer exist.</li>}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
