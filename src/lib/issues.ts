// Issue Log rules that need no database, shared by the pages, the API and the tests.
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { pickPoInstance } from "@/lib/po";

export const ISSUE_STATUSES = {
  OPEN: { label: "Open", variant: "destructive" },
  IN_PROGRESS: { label: "In progress", variant: "warning" },
  RESOLVED: { label: "Resolved", variant: "success" },
  CLOSED: { label: "Closed", variant: "secondary" },
} as const;
export type IssueStatusKey = keyof typeof ISSUE_STATUSES;

export const ISSUE_SEVERITIES = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
} as const;
export type IssueSeverityKey = keyof typeof ISSUE_SEVERITIES;

export const ISSUE_CATEGORIES = [
  "Carrier / pickup",
  "Shipping & fulfillment",
  "Receiving at THD",
  "ASN / EDI",
  "Inventory / stock",
  "Order cancellation",
  "Labeling / packaging",
  "Routing guide",
  "THD system / SPM",
  "Invoice / billing",
  "Other",
] as const;

/** POs an issue may list */
export const MAX_ISSUE_POS = 200;
const PO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,29}$/;

/** ISS-0042 */
export function issueLabel(number: number): string {
  return `ISS-${String(number).padStart(4, "0")}`;
}

/** A PO number as stored: trimmed, no spaces, upper case; null when it isn't one. */
export function normalizePoNumber(value: string): string | null {
  const po = value.trim().replace(/\s+/g, "").toUpperCase();
  return PO_PATTERN.test(po) ? po : null;
}

/** POs pasted as a list (lines, commas, semicolons, tabs or spaces), de-duplicated in order, with what couldn't be read. */
export function parsePoList(text: string): { pos: string[]; invalid: string[] } {
  const pos: string[] = [];
  const invalid: string[] = [];
  for (const part of text.split(/[\s,;]+/)) {
    if (!part) continue;
    const po = normalizePoNumber(part);
    if (!po) invalid.push(part);
    else if (!pos.includes(po)) pos.push(po);
  }
  return { pos, invalid };
}

/**
 * The PO numbers to look for in the compliance data: the number as typed, and for all-digit numbers
 * the same number with or without the leading zeros THD's exports sometimes carry.
 */
export function poNumberVariants(po: string): string[] {
  if (!/^\d+$/.test(po)) return [po];
  const bare = po.replace(/^0+/, "") || "0";
  return [...new Set([po, bare, bare.padStart(8, "0"), bare.padStart(10, "0")])];
}

/**
 * Which PO record (one use of a PO number) an issue's PO means: the use with the given create date,
 * else the use created on or before the issue date, so a reused number links to the right order.
 */
export function resolveIssuePo<T extends { poCreateDate: Date | null }>(records: T[], poCreateDate: Date | null, issueDate: Date): T | null {
  if (!records.length) return null;
  if (poCreateDate) {
    const day = poCreateDate.toISOString().slice(0, 10);
    return records.find((r) => r.poCreateDate?.toISOString().slice(0, 10) === day) ?? null;
  }
  return pickPoInstance(records, issueDate);
}

const day = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date (YYYY-MM-DD)")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), "must be a real date");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((s) => s || null);

export const MAX_HD_TICKETS = 20;

/** HD Support ticket numbers from typed or pasted text (commas, semicolons, spaces or new lines between them), de-duplicated. */
export function parseTickets(text: string): string[] {
  return cleanTickets(text.split(/[\s,;]+/));
}

/** Trimmed, non-empty, de-duplicated ticket numbers (case-insensitive), in the order given. */
export function cleanTickets(tickets: string[]): string[] {
  const out: string[] = [];
  for (const t of tickets) {
    const v = t.trim();
    if (v && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out;
}

/** The body of a new or edited issue; strings are trimmed and empty ones become null. */
export const issueInput = z.object({
  title: z.string().trim().min(1, "is required").max(200),
  issueDate: day,
  status: z.enum(Object.keys(ISSUE_STATUSES) as [keyof typeof ISSUE_STATUSES, ...(keyof typeof ISSUE_STATUSES)[]]),
  severity: z.enum(Object.keys(ISSUE_SEVERITIES) as [keyof typeof ISSUE_SEVERITIES, ...(keyof typeof ISSUE_SEVERITIES)[]]),
  category: z.enum(ISSUE_CATEGORIES),
  programId: optionalText(64),
  // A team key (Admin › Teams); the route checks it's an active team or the issue's current one
  team: z
    .string()
    .trim()
    .max(64)
    .nullish()
    .transform((t) => t || null),
  hdTickets: z
    .array(z.string().trim().max(60, "must be at most 60 characters"))
    .max(MAX_HD_TICKETS, `can list at most ${MAX_HD_TICKETS} tickets`)
    .default([])
    .transform(cleanTickets),
  description: z.string().trim().min(1, "is required").max(10_000),
  actionsTaken: optionalText(10_000),
  consequences: optionalText(10_000),
  peopleInvolved: optionalText(2_000),
  references: optionalText(2_000),
  resolution: optionalText(10_000),
  followUpDate: day.nullish().transform((d) => d ?? null),
  pos: z
    .array(z.object({ poNumber: z.string().max(60), poCreateDate: day.nullish().transform((d) => d ?? null) }))
    .max(MAX_ISSUE_POS, `can list at most ${MAX_ISSUE_POS} POs`),
});
export type IssueInput = z.infer<typeof issueInput>;

const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const isDay = (s: string | undefined): s is string => Boolean(s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(asDate(s).getTime()) && asDate(s).toISOString().startsWith(s));

/** Checked POs, de-duplicated, or the first one that isn't a PO number. */
export function cleanPos(pos: IssueInput["pos"]): { pos: { poNumber: string; poCreateDate: Date | null }[]; error?: string } {
  const out: { poNumber: string; poCreateDate: Date | null }[] = [];
  for (const p of pos) {
    const po = normalizePoNumber(p.poNumber);
    if (!po) return { pos: [], error: `"${p.poNumber}" is not a PO number` };
    const date = p.poCreateDate ? asDate(p.poCreateDate) : null;
    if (!out.some((o) => o.poNumber === po && o.poCreateDate?.getTime() === date?.getTime())) out.push({ poNumber: po, poCreateDate: date });
  }
  return { pos: out };
}

/** The scalar fields to write for an issue; resolvedAt is set when it first becomes Resolved or Closed. */
export function issueData(input: IssueInput, previous?: { status: string; resolvedAt: Date | null }) {
  const done = input.status === "RESOLVED" || input.status === "CLOSED";
  return {
    title: input.title,
    issueDate: asDate(input.issueDate),
    status: input.status,
    severity: input.severity,
    category: input.category,
    programId: input.programId,
    team: input.team,
    hdTickets: input.hdTickets,
    description: input.description,
    actionsTaken: input.actionsTaken,
    consequences: input.consequences,
    peopleInvolved: input.peopleInvolved,
    references: input.references,
    resolution: input.resolution,
    followUpDate: input.followUpDate ? asDate(input.followUpDate) : null,
    resolvedAt: done ? (previous?.resolvedAt ?? new Date()) : null,
  } satisfies Prisma.IssueUncheckedUpdateInput;
}

export interface IssueFilters {
  q?: string;
  status?: string;
  category?: string;
  from?: string;
  to?: string;
}

/** Prisma filter for the Issue Log list: search (title, number, ticket, PO, people, references), status, category, dates. */
export function issueWhere(f: IssueFilters): Prisma.IssueWhereInput {
  const and: Prisma.IssueWhereInput[] = [];
  const q = f.q?.trim().slice(0, 100);
  if (q) {
    const number = Number(q.replace(/^ISS-?/i, ""));
    const po = normalizePoNumber(q);
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        // Ticket numbers match exactly (as typed, or upper case)
        { hdTickets: { hasSome: [...new Set([q, q.toUpperCase()])] } },
        { peopleInvolved: { contains: q, mode: "insensitive" } },
        { references: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        ...(Number.isInteger(number) && number > 0 ? [{ number }] : []),
        ...(po ? [{ pos: { some: { poNumber: { in: poNumberVariants(po) } } } }] : []),
      ],
    });
  }
  if (f.status === "OPEN_ANY") and.push({ status: { in: ["OPEN", "IN_PROGRESS"] } });
  else if (f.status && f.status in ISSUE_STATUSES) and.push({ status: f.status as keyof typeof ISSUE_STATUSES });
  if (f.category && (ISSUE_CATEGORIES as readonly string[]).includes(f.category)) and.push({ category: f.category });
  if (isDay(f.from)) and.push({ issueDate: { gte: asDate(f.from) } });
  if (isDay(f.to)) and.push({ issueDate: { lte: asDate(f.to) } });
  return and.length ? { AND: and } : {};
}
