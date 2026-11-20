import Link from "next/link";
import { Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { emailsFor, type EmailSummary } from "@/lib/logistics/emails";
import { formatDateTime } from "@/lib/utils";
import { recipientsSummary, selectionSummary } from "@/lib/logistics/email-summary";

// The Logistics email log as a table: on the Emails tab, and as a card on PO and shipment pages.

const th = "px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider";
const td = "px-4 py-2.5 text-sm align-top";

export function EmailStatusBadge({ sent }: { sent: boolean }) {
  return sent ? <Badge variant="success">Sent</Badge> : <Badge variant="destructive">Not sent</Badge>;
}

export function EmailTable({ emails, tz, empty }: { emails: EmailSummary[]; tz: string; empty: string }) {
  if (!emails.length) return <p className="px-6 pb-6 text-sm text-gray-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead className="bg-gray-50">
          <tr>
            {["Sent", "From", "To", "Subject", "About", "Status"].map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {emails.map((e) => (
            <tr key={e.id} className="border-t border-gray-200 hover:bg-gray-50">
              <td className={`${td} whitespace-nowrap text-gray-700`}>{formatDateTime(e.createdAt, tz)}</td>
              <td className={`${td} text-gray-700`}>{e.senderName}</td>
              <td className={`${td} text-gray-700`} title={[...e.to, ...e.cc.map((c) => `cc ${c}`)].join("\n")}>
                {recipientsSummary(e)}
              </td>
              <td className={td}>
                <Link href={`/logistics/email/${e.id}`} className="font-medium text-blue-600 hover:underline">
                  {e.subject}
                </Link>
                {e.requests.length > 0 && <p className="text-xs text-gray-500">{e.requests.join("; ")}</p>}
              </td>
              <td className={`${td} text-gray-700`}>{selectionSummary(e)}</td>
              <td className={td}>
                <EmailStatusBadge sent={e.sent} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Emails about a PO or a shipment (PO and shipment pages) */
export async function EmailsCard({ po, shipment, tz }: { po?: string; shipment?: string; tz: string }) {
  const emails = await emailsFor({ po, shipment });
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-gray-400" />
          Emails
        </CardTitle>
        <p className="text-sm text-gray-500">
          {emails.length
            ? `Emails sent from Logistics about this ${po ? "PO" : "shipment"}${po ? " or its shipments" : " or its POs"}. Open one to read it in full.`
            : `No emails sent from Logistics about this ${po ? "PO" : "shipment"} yet.`}
        </p>
      </CardHeader>
      {emails.length > 0 && (
        <CardContent className="space-y-3 pt-0">
          {emails.map((e) => (
            <div key={e.id} className="rounded-md border border-gray-200 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/logistics/email/${e.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                  {e.subject}
                </Link>
                <EmailStatusBadge sent={e.sent} />
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                {formatDateTime(e.createdAt, tz)} · {e.senderName} to {recipientsSummary(e)}
              </p>
              <p className="text-xs text-gray-500">{selectionSummary(e)}</p>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
