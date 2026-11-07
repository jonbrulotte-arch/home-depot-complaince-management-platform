import { Badge } from "@/components/ui/badge";
import type { DisputeStatus, Disposition, ReportProgramStatus, ReportStatus } from "@prisma/client";
import { DISPUTE_STATUS_LABELS } from "@/lib/disputes";

const REPORT: Record<ReportStatus, { label: string; variant: "secondary" | "default" | "warning" | "purple" | "success" }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  IN_REVIEW: { label: "In Review", variant: "default" },
  DISPUTES: { label: "Disputes", variant: "warning" },
  SCORECARD: { label: "Scorecard", variant: "purple" },
  PUBLISHED: { label: "Published", variant: "success" },
};

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return <Badge variant={REPORT[status].variant}>{REPORT[status].label}</Badge>;
}

const PROGRAM: Record<ReportProgramStatus, { label: string; variant: "secondary" | "default" | "success" }> = {
  NOT_STARTED: { label: "No data", variant: "secondary" },
  IMPORTED: { label: "Imported", variant: "default" },
  REVIEWED: { label: "Reviewed", variant: "success" },
};

export function ProgramStatusBadge({ status }: { status: ReportProgramStatus }) {
  return <Badge variant={PROGRAM[status].variant}>{PROGRAM[status].label}</Badge>;
}

export const DISPOSITIONS: Record<Disposition, { label: string; variant: "secondary" | "default" | "warning" | "destructive" | "success" | "purple" }> = {
  PENDING: { label: "Pending", variant: "secondary" },
  ACCEPTED: { label: "Accepted", variant: "destructive" },
  DISPUTABLE: { label: "Disputable", variant: "success" },
  NOT_DISPUTABLE: { label: "Not disputable", variant: "warning" },
  NEEDS_RESEARCH: { label: "Needs research", variant: "purple" },
  RESOLVED: { label: "Cancelled / Resolved", variant: "default" },
};

export function DispositionBadge({ disposition }: { disposition: Disposition | null | undefined }) {
  const d = DISPOSITIONS[disposition ?? "PENDING"];
  return <Badge variant={d.variant}>{d.label}</Badge>;
}

export function ComplianceBadge({ compliant }: { compliant: boolean }) {
  return compliant ? <Badge variant="success">Compliant</Badge> : <Badge variant="destructive">Non-compliant</Badge>;
}

const DISPUTE: Record<DisputeStatus, "secondary" | "default" | "warning" | "destructive" | "success" | "purple" | "outline"> = {
  PREPARING: "secondary",
  READY: "purple",
  SUBMITTED: "default",
  APPROVED: "success",
  PARTIAL: "warning",
  DENIED: "destructive",
  WITHDRAWN: "outline",
};

export function DisputeStatusBadge({ status }: { status: DisputeStatus }) {
  return <Badge variant={DISPUTE[status]}>{DISPUTE_STATUS_LABELS[status]}</Badge>;
}
