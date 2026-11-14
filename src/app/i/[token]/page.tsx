import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FileText, Paperclip } from "lucide-react";
import { getBranding } from "@/lib/branding";
import { ISSUE_STATUSES, issueLabel } from "@/lib/issues";
import { sharedIssue } from "@/lib/issue-share";
import { getTimeZone } from "@/lib/time-zone-server";
import { formatDateTime } from "@/lib/utils";
import { BrandMark } from "@/components/layout/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IssueBody, issueSubtitle } from "@/components/issues/issue-view";
import { TimeZoneProvider } from "@/components/time-zone";

// Public, read-only view of an Issue Log issue. Anyone with the link can open it; no sign-in.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function SharedIssuePage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const tz = await getTimeZone();
  const { token } = await params;
  const found = await sharedIssue(token);
  if (!found) notFound();
  const { issue } = found;
  const branding = await getBranding();
  const status = ISSUE_STATUSES[issue.status];

  return (
    <TimeZoneProvider timeZone={tz} followsBrowser>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-gray-900 print:hidden">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-6 py-3">
            <BrandMark branding={branding} />
            <Button asChild variant="outline" size="sm">
              <a href={`/api/i/${token}/pdf`}>
                <FileText className="h-4 w-4 mr-1.5" />
                PDF
              </a>
            </Button>
          </div>
        </header>
        <main className="p-6 max-w-7xl mx-auto space-y-6">
          <div>
            <p className="text-xs font-medium text-gray-500">Issue Log · shared read-only</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">
                {issueLabel(issue.number)}: {issue.title}
              </h1>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <p className="text-sm text-gray-500 mt-1">{issueSubtitle(issue, tz)}</p>
          </div>
          <IssueBody
            found={found}
            tz={tz}
            canOpenPo={false}
            files={
              issue.attachments.length === 0 ? (
                <p className="text-sm text-gray-400">No files attached.</p>
              ) : (
                <>
                  <ul className="divide-y divide-gray-200">
                    {issue.attachments.map((a) => (
                      <li key={a.id} className="flex items-start gap-2 py-2">
                        <Paperclip className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        <div>
                          <p className="text-sm text-gray-900">{a.fileName}</p>
                          <p className="text-xs text-gray-500">
                            {a.size < 1024 ? "under 1 KB" : `${(a.size / 1024).toFixed(0)} KB`} · {formatDateTime(a.createdAt, tz)}
                            {a.uploadedBy ? ` · ${a.uploadedBy.name}` : ""}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-gray-500">Files can be opened by signed-in users of the platform.</p>
                </>
              )
            }
          />
        </main>
      </div>
    </TimeZoneProvider>
  );
}
