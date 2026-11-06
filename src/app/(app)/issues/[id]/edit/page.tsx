import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import { issueLabel } from "@/lib/issues";
import { IssueForm } from "../../issue-form";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function EditIssuePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission("issues.manage");
  const { id } = await params;
  const [issue, programs] = await Promise.all([
    prisma.issue.findUnique({ where: { id }, include: { pos: { orderBy: { poNumber: "asc" } } } }),
    prisma.program.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!issue) notFound();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <Link href={`/issues/${id}`} className="inline-flex items-center text-xs text-gray-500 hover:text-gray-700">
          <ChevronLeft className="h-4 w-4" /> {issueLabel(issue.number)}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit {issueLabel(issue.number)}</h1>
      </div>
      <IssueForm
        issueId={id}
        programs={programs}
        initial={{
          title: issue.title,
          issueDate: day(issue.issueDate),
          status: issue.status,
          severity: issue.severity,
          category: issue.category,
          programId: issue.programId,
          team: issue.team,
          hdTickets: issue.hdTickets,
          description: issue.description,
          actionsTaken: issue.actionsTaken ?? "",
          consequences: issue.consequences ?? "",
          peopleInvolved: issue.peopleInvolved ?? "",
          references: issue.references ?? "",
          resolution: issue.resolution ?? "",
          followUpDate: day(issue.followUpDate),
          pos: issue.pos.map((p) => ({ poNumber: p.poNumber, poCreateDate: day(p.poCreateDate) })),
        }}
      />
    </div>
  );
}
