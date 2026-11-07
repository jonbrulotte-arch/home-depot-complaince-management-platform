import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/auth-guard";
import { LINE_FIELD_LABELS } from "@/lib/line-fields";
import { getPeriodField, linesInPeriod } from "@/lib/periods";
import { issuesForPoRecords } from "@/lib/issues-data";
import { ISSUE_STATUSES, issueLabel } from "@/lib/issues";
import { formatUtcDate } from "@/lib/utils";
import { TriageWorkspace, type TriageLine } from "./triage-workspace";
import { getTeams } from "@/lib/teams";

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission("reports.view");
  const { id } = await params;
  const report = await prisma.complianceReport.findUnique({
    where: { id },
    include: { period: true, programs: { include: { program: true }, orderBy: { program: { sortOrder: "asc" } } } },
  });
  if (!report) notFound();

  const programIds = report.programs.map((p) => p.programId);
  const lines = await prisma.complianceLine.findMany({
    where: { ...linesInPeriod(await getPeriodField(), report.period.fiscalMonth), isCompliant: false, metric: { programId: { in: programIds } } },
    include: { metric: { include: { program: true } }, review: true, dispute: { select: { id: true, status: true } } },
    orderBy: [{ metric: { program: { sortOrder: "asc" } } }, { metric: { sortOrder: "asc" } }, { poNumber: "asc" }, { sourceRow: "asc" }],
  });

  const metricIds = [...new Set(lines.map((l) => l.metricId))];
  const poNumbers = [...new Set(lines.map((l) => l.poNumber).filter((p): p is string => Boolean(p)))];
  const recordIds = [...new Set(lines.flatMap((l) => (l.poRecordId ? [l.poRecordId] : [])))];
  const [reasonCodes, history, issues] = await Promise.all([
    prisma.disputeReasonCode.findMany({ where: { metricId: { in: metricIds }, active: true }, orderBy: { code: "asc" } }),
    poNumbers.length
      ? prisma.complianceLine.findMany({
          where: { poNumber: { in: poNumbers }, id: { notIn: lines.map((l) => l.id) }, isCompliant: false },
          include: { metric: { include: { program: true } }, review: { select: { disposition: true } } },
          orderBy: { fiscalMonth: "desc" },
        })
      : Promise.resolve([]),
    user.permissions.has("issues.view") ? issuesForPoRecords(recordIds) : Promise.resolve(new Map<string, never[]>()),
  ]);

  const toTriage = (l: (typeof lines)[number]): TriageLine => {
    const record = l as unknown as Record<string, unknown>;
    return {
      id: l.id,
      programName: l.metric.program.name,
      metricId: l.metricId,
      metricName: l.metric.name,
      poNumber: l.poNumber,
      offset: Number(l.offsetAmount),
      sourceSheet: l.sourceSheet,
      sourceRow: l.sourceRow,
      fields: LINE_FIELD_LABELS.flatMap(([key, label, kind]) => {
        const v = record[key];
        if (v === null || v === undefined) return [];
        return [{ key, label, kind, value: v instanceof Date ? v.toISOString() : typeof v === "object" ? Number(v) : (v as string | number | boolean) }];
      }),
      raw: l.raw as Record<string, string | number | boolean | null>,
      dispute: l.dispute,
      issues: (l.poRecordId ? (issues.get(l.poRecordId) ?? []) : []).map((i) => ({
        id: i.id,
        label: issueLabel(i.number),
        title: i.title,
        date: formatUtcDate(i.issueDate),
        status: ISSUE_STATUSES[i.status].label,
        statusVariant: ISSUE_STATUSES[i.status].variant,
      })),
      review: l.review
        ? {
            disposition: l.review.disposition,
            teamInfluence: l.review.teamInfluence,
            reasonCodeId: l.review.reasonCodeId,
            rootCause: l.review.rootCause,
            notes: l.review.notes,
            extraFields: (l.review.extraFields as Record<string, string> | null) ?? {},
          }
        : null,
    };
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link href={`/reports/${id}`} className="inline-flex items-center text-xs text-gray-500 hover:text-gray-700">
          <ChevronLeft className="h-4 w-4" /> {report.title}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Violation review</h1>
        <p className="text-sm text-gray-500 mt-1">
          Decide for each non-compliant line whether it stands or can be disputed, and record what caused it.
        </p>
      </div>
      <TriageWorkspace
        teams={(await getTeams()).map((t) => ({ key: t.key, name: t.name, active: t.active }))}
        lines={lines.map(toTriage)}
        reasonCodes={reasonCodes.map((r) => ({ id: r.id, metricId: r.metricId, code: r.code, whenToUse: r.whenToUse, requiredDocs: r.requiredDocs, docDetails: r.docDetails }))}
        history={history.map((h) => ({
          poNumber: h.poNumber!,
          fiscalMonth: h.fiscalMonth,
          label: `${h.metric.program.name} · ${h.metric.name}`,
          offset: Number(h.offsetAmount),
          disposition: h.review?.disposition ?? null,
        }))}
        reportId={id}
        canEdit={user.permissions.has("lines.triage") && report.status !== "PUBLISHED"}
      />
    </div>
  );
}
