import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import { normalizePoNumber } from "@/lib/issues";
import { IssueForm } from "../issue-form";

export default async function NewIssuePage({ searchParams }: { searchParams: Promise<{ po?: string; poDate?: string }> }) {
  await requirePagePermission("issues.manage");
  const sp = await searchParams;
  const programs = await prisma.program.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  // Opened from a PO record: start with that PO (and its create date, for reused numbers)
  const po = sp.po ? normalizePoNumber(sp.po) : null;
  const poDate = sp.poDate && /^\d{4}-\d{2}-\d{2}$/.test(sp.poDate) ? sp.poDate : "";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <Link href="/issues" className="inline-flex items-center text-xs text-gray-500 hover:text-gray-700">
          <ChevronLeft className="h-4 w-4" /> Issue Log
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Log an issue</h1>
        <p className="text-sm text-gray-500 mt-1">Record it while it&apos;s fresh. You can add updates, files and the resolution later.</p>
      </div>
      <IssueForm
        programs={programs}
        initial={{
          title: "",
          issueDate: new Date().toISOString().slice(0, 10),
          status: "OPEN",
          severity: "MEDIUM",
          category: "Other",
          programId: null,
          team: null,
          hdTickets: [],
          description: "",
          actionsTaken: "",
          consequences: "",
          peopleInvolved: "",
          references: "",
          resolution: "",
          followUpDate: "",
          pos: [{ poNumber: po ?? "", poCreateDate: po ? poDate : "" }],
        }}
      />
    </div>
  );
}
