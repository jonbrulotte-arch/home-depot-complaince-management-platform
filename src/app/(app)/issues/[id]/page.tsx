import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileText, Pencil } from "lucide-react";
import { requirePagePermission } from "@/lib/auth-guard";
import { getIssue } from "@/lib/issues-data";
import { ISSUE_STATUSES, issueLabel } from "@/lib/issues";
import { getTimeZone } from "@/lib/time-zone-server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IssueBody, issueSubtitle } from "@/components/issues/issue-view";
import { AddIssueNote } from "./issue-notes";
import { IssueAttachments } from "./issue-attachments";
import { DeleteIssueButton } from "./delete-issue-button";
import { ShareIssueButton } from "./share-issue-button";
import { prisma } from "@/lib/prisma";
import { PoLogisticsCard } from "@/components/logistics/po-logistics-card";

export default async function IssuePage({ params }: { params: Promise<{ id: string }> }) {
  const tz = await getTimeZone();
  const user = await requirePagePermission("issues.view");
  const found = await getIssue((await params).id);
  if (!found) notFound();
  const { issue } = found;
  const share = await prisma.issueShare.findUnique({ where: { issueId: issue.id }, select: { token: true } });
  const canEdit = user.permissions.has("issues.manage");
  const canDelete = canEdit && (issue.createdById === user.id || user.permissions.has("admin.users"));
  const canOpenPo = user.permissions.has("view.polookup");
  const label = issueLabel(issue.number);
  const status = ISSUE_STATUSES[issue.status];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/issues" className="inline-flex items-center text-xs text-gray-500 hover:text-gray-700">
            <ChevronLeft className="h-4 w-4" /> Issue Log
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">
              {label}: {issue.title}
            </h1>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <p className="text-sm text-gray-500 mt-1">{issueSubtitle(issue, tz)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/issues/${issue.id}/pdf`}>
              <FileText className="h-4 w-4 mr-1.5" />
              PDF
            </a>
          </Button>
          {canEdit && <ShareIssueButton issueId={issue.id} label={label} initialToken={share?.token ?? null} />}
          {canEdit && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/issues/${issue.id}/edit`}>
                <Pencil className="h-4 w-4 mr-1.5" />
                Edit
              </Link>
            </Button>
          )}
          {canDelete && <DeleteIssueButton issueId={issue.id} label={label} />}
        </div>
      </div>

      <IssueBody
        found={found}
        tz={tz}
        canOpenPo={canOpenPo}
        logistics={user.permissions.has("logistics.view") && found.pos.length ? <PoLogisticsCard poNumbers={found.pos.map((p) => p.poNumber)} /> : null}
        updatesFooter={canEdit ? <AddIssueNote issueId={issue.id} /> : null}
        files={
          <IssueAttachments
            issueId={issue.id}
            canEdit={canEdit}
            attachments={issue.attachments.map((a) => ({ id: a.id, fileName: a.fileName, size: a.size, createdAt: a.createdAt.toISOString(), uploadedBy: a.uploadedBy?.name ?? null }))}
          />
        }
      />
    </div>
  );
}
