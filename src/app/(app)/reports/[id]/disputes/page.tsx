import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import { LINE_FIELD_LABELS } from "@/lib/line-fields";
import type { ChecklistItem } from "@/lib/disputes";
import { DisputeWorkspace, type DisputeView } from "./dispute-workspace";

export default async function ReportDisputesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ d?: string }> }) {
  const user = await requirePagePermission("reports.view");
  const { id } = await params;
  const { d } = await searchParams;
  const report = await prisma.complianceReport.findUnique({ where: { id }, include: { period: true, programs: true } });
  if (!report) notFound();

  const disputes = await prisma.dispute.findMany({
    where: { line: { fiscalMonth: report.period.fiscalMonth, metric: { programId: { in: report.programs.map((p) => p.programId) } } } },
    include: {
      line: { include: { metric: { include: { program: true } }, review: true } },
      reasonCode: true,
      events: { orderBy: { at: "desc" }, include: { user: { select: { name: true } } } },
      attachments: { orderBy: { uploadedAt: "asc" }, select: { id: true, fileName: true, size: true, uploadedAt: true, uploadedBy: { select: { name: true } } } },
    },
    orderBy: [{ line: { metric: { program: { sortOrder: "asc" } } } }, { line: { metric: { sortOrder: "asc" } } }, { line: { poNumber: "asc" } }],
  });
  const reasonCodes = await prisma.disputeReasonCode.findMany({
    where: { metricId: { in: [...new Set(disputes.map((x) => x.line.metricId))] }, active: true },
    orderBy: { code: "asc" },
  });

  const view: DisputeView[] = disputes.map((x) => {
    const line = x.line as unknown as Record<string, unknown>;
    return {
      id: x.id,
      status: x.status,
      programName: x.line.metric.program.name,
      metricId: x.line.metricId,
      metricName: x.line.metric.name,
      poNumber: x.line.poNumber,
      lineOffset: Number(x.line.offsetAmount),
      reviewNotes: x.line.review?.notes ?? null,
      keyFields: LINE_FIELD_LABELS.flatMap(([key, label, kind]) => {
        const v = line[key];
        if (v === null || v === undefined || key.startsWith("spm")) return [];
        return [{ key, label, kind, value: v instanceof Date ? v.toISOString() : typeof v === "object" ? Number(v) : (v as string | number | boolean) }];
      }),
      reasonCodeId: x.reasonCodeId,
      amountDisputed: Number(x.amountDisputed),
      amountRecovered: x.amountRecovered == null ? null : Number(x.amountRecovered),
      dueDate: x.dueDate?.toISOString() ?? null,
      checklist: x.checklist as unknown as ChecklistItem[],
      supplierComment: x.supplierComment,
      submittedAt: x.submittedAt?.toISOString() ?? null,
      spmReference: x.spmReference,
      decidedAt: x.decidedAt?.toISOString() ?? null,
      decisionCode: x.decisionCode,
      decisionNotes: x.decisionNotes,
      spmDecisionSeen: x.spmDecisionSeen,
      events: x.events.map((e) => ({ id: e.id, type: e.type, body: e.body, fromStatus: e.fromStatus, toStatus: e.toStatus, user: e.user?.name ?? null, at: e.at.toISOString() })),
      attachments: x.attachments.map((a) => ({ id: a.id, fileName: a.fileName, size: a.size, uploadedAt: a.uploadedAt.toISOString(), uploadedBy: a.uploadedBy?.name ?? null })),
    };
  });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href={`/reports/${id}`} className="inline-flex items-center text-xs text-gray-500 hover:text-gray-700">
          <ChevronLeft className="h-4 w-4" /> {report.title}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Disputes</h1>
        <p className="text-sm text-gray-500 mt-1">
          Prepare documents, submit each dispute in the Supplier Performance Management tool, then record THD&apos;s decision.
        </p>
      </div>
      <DisputeWorkspace
        reportId={id}
        reportStatus={report.status}
        period={{
          id: report.period.id,
          fiscalMonth: report.period.fiscalMonth,
          disputeOpen: report.period.disputeOpen?.toISOString() ?? null,
          disputeClose: report.period.disputeClose?.toISOString() ?? null,
        }}
        disputes={view}
        reasonCodes={reasonCodes.map((r) => ({ id: r.id, metricId: r.metricId, code: r.code, whenToUse: r.whenToUse, requiredDocs: r.requiredDocs, docDetails: r.docDetails }))}
        initialId={d ?? null}
        canEdit={user.permissions.has("disputes.manage")}
      />
    </div>
  );
}
