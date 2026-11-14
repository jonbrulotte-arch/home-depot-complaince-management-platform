import type { DisputeStatus } from "@prisma/client";
import { fiscalToCalendar } from "@/lib/fiscal";

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  PREPARING: "Preparing",
  READY: "Ready to submit",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  PARTIAL: "Partially approved",
  DENIED: "Denied",
  WITHDRAWN: "Withdrawn",
};

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_EXTENSIONS = /\.(pdf|png|jpe?g|gif|xlsx?|csv|docx?|msg|eml|txt)$/i;

export const OPEN_STATUSES: DisputeStatus[] = ["PREPARING", "READY"];
export const DECIDED_STATUSES: DisputeStatus[] = ["APPROVED", "PARTIAL", "DENIED"];

// Allowed moves. Decisions can be reopened (back to SUBMITTED) to correct a mistake, and a
// withdrawn dispute can be picked up again while it was never submitted.
const TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
  PREPARING: ["READY", "SUBMITTED", "WITHDRAWN"],
  READY: ["PREPARING", "SUBMITTED", "WITHDRAWN"],
  SUBMITTED: ["APPROVED", "PARTIAL", "DENIED", "READY"],
  APPROVED: ["SUBMITTED"],
  PARTIAL: ["SUBMITTED"],
  DENIED: ["SUBMITTED"],
  WITHDRAWN: ["PREPARING"],
};

export function allowedTransitions(from: DisputeStatus): DisputeStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: DisputeStatus, to: DisputeStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export interface ChecklistItem {
  label: string;
  done: boolean;
}

/** Document checklist from the THD dispute matrix entry for the chosen reason code. */
export function buildChecklist(reason: { requiredDocs: string | null; docDetails: string | null } | null): ChecklistItem[] {
  const items: string[] = [];
  if (reason?.requiredDocs) items.push(`Obtain: ${reason.requiredDocs}`);
  for (const detail of (reason?.docDetails ?? "").split(";")) {
    const d = detail.trim();
    // Lower-case the first word unless it is an acronym ("PO number", "EDI timestamp")
    if (d) items.push(`Document shows ${/^[A-Z][a-z]/.test(d) ? d.charAt(0).toLowerCase() + d.slice(1) : d}`);
  }
  if (!items.length) items.push("Gather supporting documentation");
  items.push("Highlight or circle the key information on each document");
  return items.map((label) => ({ label, done: false }));
}

function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month, 1 + offset + (n - 1) * 7));
}

/**
 * THD's rule: performance is published the following month; the dispute period opens on its
 * 2nd Wednesday and closes at close of business on the 2nd Tuesday of the month after.
 * Calendar months approximate THD's 4-4-5 fiscal calendar, so the dates are editable.
 */
export function defaultDisputeWindow(fiscalMonth: number): { open: Date; close: Date } {
  const { year, month } = fiscalToCalendar(fiscalMonth);
  const open = nthWeekday(year + Math.floor((month + 1) / 12), (month + 1) % 12, 3, 2);
  const close = nthWeekday(year + Math.floor((month + 2) / 12), (month + 2) % 12, 2, 2);
  return { open, close };
}

/** Text for the SPM dispute comment field. */
export function draftSupplierComment(line: { poNumber: string | null; metricName: string }, reasonCode: string | null, notes: string | null): string {
  const parts = [`PO ${line.poNumber ?? "(none)"} - ${line.metricName}.`];
  if (reasonCode) parts.push(`Dispute reason: ${reasonCode}.`);
  if (notes?.trim()) parts.push(notes.trim());
  parts.push("Supporting documentation attached.");
  return parts.join(" ");
}

export function isApprovedDecision(value: string | null | undefined): boolean {
  return Boolean(value && /approv/i.test(value));
}

export function isDeniedDecision(value: string | null | undefined): boolean {
  return Boolean(value && /den(y|ied)/i.test(value));
}
