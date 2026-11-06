import { notFound } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth-guard";
import { clientIp } from "@/lib/client-ip";
import { issueLabel } from "@/lib/issues";
import { issuePdfResponse, sharedIssue } from "@/lib/issue-share";

type Params = { params: Promise<{ token: string }> };

/** The PDF of a shared issue, through its public link (no sign-in). */
export async function GET(req: Request, { params }: Params) {
  const found = await sharedIssue((await params).token);
  if (!found) return notFound("This link is not valid or was turned off");
  const user = await getCurrentUser();
  await audit(user?.id ?? null, "issue.pdf", "Issue", found.issue.id, { issue: issueLabel(found.issue.number), publicLink: true, ip: clientIp(req.headers) });
  return issuePdfResponse(found);
}
