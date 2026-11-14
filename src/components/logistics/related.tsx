import Link from "next/link";
import { NotebookPen, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ISSUE_STATUSES, issueLabel } from "@/lib/issues";
import type { IssueSummary } from "@/lib/issues-data";
import type { CompliancePo } from "@/lib/logistics/links";
import { formatCurrency, formatUtcDate } from "@/lib/utils";

/** Issue Log issues for the POs shown, with a button to log one */
export function IssuesCard({ issues, newIssuePo, canManage }: { issues: (IssueSummary & { pos?: string[] })[]; newIssuePo: string | null; canManage: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2">
          <NotebookPen className="h-4 w-4 text-gray-400" />
          Issue Log
        </CardTitle>
        {canManage && newIssuePo && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/issues/new?po=${encodeURIComponent(newIssuePo)}`}>
              <Plus className="h-4 w-4 mr-1" />
              Log an issue
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {issues.length === 0 ? (
          <p className="text-sm text-gray-400">No issues logged for {newIssuePo ? "this PO" : "these POs"}.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {issues.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/issues/${i.id}`} className="font-medium text-blue-600 hover:underline">
                  {issueLabel(i.number)}
                </Link>
                <span className="text-gray-900">{i.title}</span>
                <Badge variant={ISSUE_STATUSES[i.status].variant}>{ISSUE_STATUSES[i.status].label}</Badge>
                <span className="text-xs text-gray-500">
                  {formatUtcDate(i.issueDate)}
                  {i.pos?.length ? ` · PO${i.pos.length > 1 ? "s" : ""} ${i.pos.join(", ")}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** THD's compliance data for the POs shown: violations and offsets, linking to PO records */
export function ComplianceCard({ rows, canOpen }: { rows: (CompliancePo & { po?: string })[]; canOpen: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>THD compliance data</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400">Not in THD&apos;s compliance data (SPM) yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {rows.map((r) => (
              <li key={r.recordId}>
                {canOpen ? (
                  <Link href={`/po/${r.recordId}`} className="font-medium text-blue-600 hover:underline">
                    PO record {r.poNumber}
                  </Link>
                ) : (
                  <span className="font-medium text-gray-900">PO {r.poNumber}</span>
                )}
                {r.poCreateDate && <span className="text-xs text-gray-500"> · created {formatUtcDate(r.poCreateDate)}</span>}
                <span className={r.violations ? "ml-2 text-red-700" : "ml-2 text-green-700"}>
                  {r.violations ? `${r.violations} violation(s), ${formatCurrency(r.offsets)} in offsets` : "no violations"}
                </span>
                {r.metrics.length > 0 && <span className="block text-xs text-gray-500">{r.metrics.join(", ")}</span>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
