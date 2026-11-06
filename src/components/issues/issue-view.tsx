import Link from "next/link";
import type { ReactNode } from "react";
import { ISSUE_SEVERITIES } from "@/lib/issues";
import type { getIssue } from "@/lib/issues-data";
import { fiscalLabel } from "@/lib/fiscal";
import { teamNames } from "@/lib/teams";
import { cn, formatCurrency, formatDateTime, formatUtcDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComplianceBadge, DispositionBadge, DisputeStatusBadge } from "@/components/shared/status-badges";

// An Issue Log issue as shown on its page (/issues/<id>) and on its public read-only page
// (/i/<token>): what happened, details, its POs tied to compliance data, updates and files.

export type IssueFound = NonNullable<Awaited<ReturnType<typeof getIssue>>>;

const th = "px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap";
const td = "px-3 py-2 text-sm align-top";

function Text({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      {value ? <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-900">{value}</p> : <p className="mt-0.5 text-sm text-gray-400">Not recorded</p>}
    </div>
  );
}

/** "Logged … by … · updated … by …" */
export function issueSubtitle(issue: IssueFound["issue"], tz: string): string {
  return (
    `Logged ${formatDateTime(issue.createdAt, tz)}${issue.createdBy ? ` by ${issue.createdBy.name}` : ""}` +
    (issue.updatedAt.getTime() - issue.createdAt.getTime() > 1000 ? ` · updated ${formatDateTime(issue.updatedAt, tz)}${issue.updatedBy ? ` by ${issue.updatedBy.name}` : ""}` : "")
  );
}

export async function IssueBody({
  found,
  tz,
  canOpenPo,
  updatesFooter,
  files,
}: {
  found: IssueFound;
  tz: string;
  /** Link PO numbers to their PO record pages (signed in with PO Lookup) */
  canOpenPo: boolean;
  /** Below the updates, e.g. the form to add one */
  updatesFooter?: ReactNode;
  /** The Files card's content */
  files: ReactNode;
}) {
  const { issue, pos } = found;
  const teams = await teamNames();
  const linked = pos.filter((p) => p.record);
  const violations = linked.flatMap((p) => p.lines.filter((l) => !l.isCompliant));
  const offsets = violations.reduce((s, l) => s + Number(l.offsetAmount), 0);
  const facts: [string, string][] = [
    ["Date of the issue", formatUtcDate(issue.issueDate)],
    ["Category", issue.category],
    ["Severity", ISSUE_SEVERITIES[issue.severity]],
    [issue.hdTickets.length > 1 ? "HD Support tickets" : "HD Support ticket", issue.hdTickets.join(", ") || "—"],
    ["THD program", issue.program?.name ?? "—"],
    ["Team responsible", issue.team ? (teams[issue.team] ?? issue.team) : "—"],
    ["Follow-up date", issue.followUpDate ? formatUtcDate(issue.followUpDate) : "—"],
    ["Resolved", issue.resolvedAt ? formatDateTime(issue.resolvedAt, tz) : "—"],
  ];

  return (
    <>
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle>What happened</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap text-sm text-gray-900">{issue.description}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <Text label="Actions taken" value={issue.actionsTaken} />
            <Text label="Consequences" value={issue.consequences} />
            <Text label="People involved" value={issue.peopleInvolved} />
            <Text label="References" value={issue.references} />
          </div>
          {(issue.resolution || issue.status === "RESOLVED" || issue.status === "CLOSED") && <Text label="Resolution" value={issue.resolution} />}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2">
            {facts.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 text-sm">
                <dt className="text-gray-500">{k}</dt>
                <dd className="text-right text-gray-900">{v}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>

    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle>POs and compliance data</CardTitle>
        <p className="text-sm text-gray-500">
          {pos.length === 0
            ? "No POs were listed for this issue."
            : `${linked.length} of ${pos.length} PO(s) found in the compliance data so far` +
              (violations.length ? ` · ${violations.length} violation(s), ${formatCurrency(offsets)} in offsets` : "") +
              ". The others link automatically once THD's exports for them are imported."}
        </p>
      </CardHeader>
      {pos.length > 0 && (
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  {["PO #", "Month", "Program · Metric", "Result", "Offset", "Decision", "Team", "Dispute"].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pos.flatMap((p) => {
                  const poCell = (rows: number) => (
                    <td className={cn(td, "text-gray-900")} rowSpan={rows}>
                      {p.record && canOpenPo ? (
                        <Link href={`/po/${p.record.id}`} className="text-blue-600 hover:underline">
                          {p.poNumber}
                        </Link>
                      ) : (
                        p.poNumber
                      )}
                      {(p.poCreateDate ?? p.record?.poCreateDate) && <div className="text-xs text-gray-500">Created {formatUtcDate(p.poCreateDate ?? p.record!.poCreateDate)}</div>}
                    </td>
                  );
                  if (!p.record || p.lines.length === 0) {
                    return [
                      <tr key={p.id} className="border-t border-gray-200">
                        {poCell(1)}
                        <td className={cn(td, "text-gray-400")} colSpan={7}>
                          {p.record ? "In the PO records, with no compliance lines." : "Not in the compliance data yet."}
                        </td>
                      </tr>,
                    ];
                  }
                  return p.lines.map((l, n) => (
                    <tr key={l.id} className={cn("border-gray-200", n === 0 && "border-t")}>
                      {n === 0 && poCell(p.lines.length)}
                      <td className={cn(td, "text-gray-700 whitespace-nowrap")}>
                        {fiscalLabel(l.receivedMonth ?? l.fiscalMonth)}
                        <div className="text-xs text-gray-500">FM {l.fiscalMonth}</div>
                      </td>
                      <td className={cn(td, "text-gray-900")}>
                        {l.metric.program.name}
                        <div className="text-xs text-gray-500">{l.metric.name}</div>
                      </td>
                      <td className={td}>
                        <ComplianceBadge compliant={l.isCompliant} />
                      </td>
                      <td className={cn(td, "text-gray-900")}>{Number(l.offsetAmount) ? formatCurrency(Number(l.offsetAmount)) : "—"}</td>
                      <td className={td}>{l.isCompliant ? <span className="text-gray-400">—</span> : <DispositionBadge disposition={l.review?.disposition} />}</td>
                      <td className={cn(td, "text-gray-700")}>{l.review?.teamInfluence ? (teams[l.review.teamInfluence] ?? l.review.teamInfluence) : "—"}</td>
                      <td className={td}>
                        {l.dispute ? (
                          <>
                            <DisputeStatusBadge status={l.dispute.status} />
                            {l.dispute.amountRecovered && Number(l.dispute.amountRecovered) > 0 && (
                              <div className="text-xs text-green-700">{formatCurrency(Number(l.dispute.amountRecovered))} recovered</div>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>

    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Updates</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {issue.notes.length === 0 ? (
            <p className="text-sm text-gray-400">No updates yet.</p>
          ) : (
            <ol className="space-y-3">
              {issue.notes.map((n) => (
                <li key={n.id} className="border-l-2 border-gray-200 pl-3">
                  <p className="text-xs text-gray-500">
                    <span className="font-medium text-gray-700">{n.author?.name ?? "Former user"}</span> · {formatDateTime(n.createdAt, tz)}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-gray-900">{n.body}</p>
                </li>
              ))}
            </ol>
          )}
          {updatesFooter}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Files</CardTitle>
        </CardHeader>
        <CardContent>
          {files}
        </CardContent>
      </Card>
    </div>
    </>
  );
}
