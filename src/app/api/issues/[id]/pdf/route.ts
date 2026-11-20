import { requireApiPermission } from "@/lib/auth-guard";
import { notFound, type IdParams } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getIssue } from "@/lib/issues-data";
import { issueLabel } from "@/lib/issues";
import { issuePdfResponse } from "@/lib/issue-share";

/** An issue as a PDF download. */
export async function GET(_req: Request, { params }: IdParams) {
  const guard = await requireApiPermission("issues.view");
  if (guard.error) return guard.error;
  const found = await getIssue((await params).id);
  if (!found) return notFound("Issue not found");
  await audit(guard.user.id, "issue.pdf", "Issue", found.issue.id, { issue: issueLabel(found.issue.number) });
  return issuePdfResponse(found);
}
