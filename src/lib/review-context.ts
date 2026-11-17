import { prisma } from "@/lib/prisma";
import { poNumberVariants, ISSUE_SEVERITIES, ISSUE_STATUSES, issueLabel } from "@/lib/issues";
import { issuesForPoRecords } from "@/lib/issues-data";
import { loadLogistics, scacLink } from "@/lib/logistics/data";
import type { Flag, PoStatus, PoView } from "@/lib/logistics/views";
import { teamNames } from "@/lib/teams";
import { recipientsSummary } from "@/lib/logistics/email-summary";

// The research a violation review shows beside each line: the PO's logistics (WMS, TMS, UPS and
// notes), its TMS shipments and its Issue Log issues. Built on the server once per page and passed
// to the client as plain data (dates as ISO strings).

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export interface ReviewShipment {
  number: string;
  status: string;
  /** TMS's status when the shipment is shown Canceled through the Issue Log */
  tmsStatus: string | null;
  scac: string | null;
  /** The SCAC TMS has when it was changed (RG shown as UPSN) */
  tmsScac: string | null;
  scacUrl: string | null;
  scacKnown: boolean;
  pickup: string | null;
  delivery: string | null;
  from: string;
  to: string;
  appointment: string | null;
  ourPos: string[];
  otherPos: number;
  cartonCount: number;
  flags: Flag[];
}

export interface ReviewLogistics {
  poNumber: string;
  status: PoStatus;
  tmsPoStatus: string | null;
  createdAt: string | null;
  origin: string;
  destination: string;
  firstShipped: string | null;
  lastShipped: string | null;
  cartonCount: number;
  units: number;
  wmsTms: string[];
  ups: string[];
  pros: string[];
  flags: Flag[];
  shipments: ReviewShipment[];
  cartons: { label: string; order: string | null; tracking: string | null; product: string | null; quantity: number | null; shippedAt: string; shipTo: string }[];
  parcels: { number: string; status: string | null; delivered: boolean; deliveredAt: string | null; expectedAt: string | null; lastActivity: string | null; lastLocation: string | null; checkedAt: string | null }[];
  notes: { body: string; author: string; at: string; shipment: string | null }[];
  /** Logistics emails about the PO or its shipments (the email log), newest first */
  emails: { id: string; at: string; sender: string; to: string; subject: string; requests: string[]; sent: boolean }[];
}

/** A line's PO as the review sees it in Logistics: found, not in the data, or only a later use of the number */
export type ReviewLogisticsResult = { kind: "found"; po: ReviewLogistics } | { kind: "missing" } | { kind: "otherUse"; createdAt: string };

const MAX_CARTONS = 40;

/**
 * Logistics for each line's PO, keyed by `key` (the PO record id, else the PO number). THD reuses PO
 * numbers and Logistics holds only the latest use (the WMS report covers about 60 days): when the
 * line's PO record was created before the Logistics PO's create date, that data is for a later use.
 */
export async function reviewLogistics(items: { key: string; poNumber: string; poCreateDate: Date | null }[]): Promise<Record<string, ReviewLogisticsResult>> {
  const out: Record<string, ReviewLogisticsResult> = {};
  if (!items.length) return out;
  const l = await loadLogistics();
  const byNumber = new Map(l.pos.map((p) => [p.poNumber, p]));
  const shipmentsByNumber = new Map(l.shipments.map((s) => [s.shipmentNumber, s]));
  const found = new Map<string, PoView>();
  for (const it of items) {
    const p = l.empty ? undefined : poNumberVariants(it.poNumber.trim().toUpperCase()).map((v) => byNumber.get(v)).find(Boolean);
    if (!p) out[it.key] = { kind: "missing" };
    else if (it.poCreateDate && p.createdAt && it.poCreateDate.toISOString().slice(0, 10) < p.createdAt.toISOString().slice(0, 10)) out[it.key] = { kind: "otherUse", createdAt: p.createdAt.toISOString() };
    else found.set(it.key, p);
  }
  if (!found.size) return out;

  const numbers = [...new Set([...found.values()].map((p) => p.poNumber))];
  const shipmentNumbers = [...new Set([...found.values()].flatMap((p) => p.shipments.map((s) => s.shipmentNumber)))];
  const emails = await prisma.logisticsEmail.findMany({
    where: { OR: [{ poNumbers: { hasSome: numbers } }, ...(shipmentNumbers.length ? [{ shipmentNumbers: { hasSome: shipmentNumbers } }] : [])] },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, createdAt: true, senderName: true, teamName: true, to: true, cc: true, subject: true, requests: true, sent: true, poNumbers: true, shipmentNumbers: true },
  });
  const notes = await prisma.logisticsNote.findMany({
    where: { OR: [{ poNumber: { in: numbers } }, ...(shipmentNumbers.length ? [{ shipmentNumber: { in: shipmentNumbers } }] : [])] },
    orderBy: { createdAt: "desc" },
    select: { poNumber: true, shipmentNumber: true, body: true, createdAt: true, author: { select: { name: true } } },
  });

  for (const [key, p] of found) {
    const shipments: ReviewShipment[] = p.shipments.map((sh) => {
      const s = shipmentsByNumber.get(sh.shipmentNumber);
      const link = sh.scac ? scacLink(l, sh.scac, { shipment: sh.shipmentNumber, po: p.poNumber, pro: p.pros[0], ups: p.ups[0] }) : null;
      return {
        number: sh.shipmentNumber,
        status: sh.status,
        tmsStatus: s?.tmsStatus ?? null,
        scac: sh.scac,
        tmsScac: sh.tmsScac ?? null,
        scacUrl: link?.url ?? null,
        scacKnown: link?.known ?? false,
        pickup: sh.pickupLocal,
        delivery: sh.deliveryLocal,
        from: [sh.originFacility, [sh.originCity, sh.originState].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "?",
        to: [sh.destFacility, [sh.destCity, sh.destState].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "?",
        appointment: sh.appointment,
        ourPos: s?.ourPos ?? [p.poNumber],
        otherPos: s?.otherPos.length ?? 0,
        cartonCount: s?.cartonCount ?? 0,
        flags: (s?.flags ?? []).filter((f) => f.severity !== "info" || f.code === "CANCELED_BY_ISSUE"),
      };
    });
    out[key] = {
      kind: "found",
      po: {
        poNumber: p.poNumber,
        status: p.status,
        tmsPoStatus: p.tms?.status ?? null,
        createdAt: iso(p.createdAt),
        origin: p.origin,
        destination: p.destination,
        firstShipped: iso(p.firstShipped),
        lastShipped: iso(p.lastShipped),
        cartonCount: p.cartonCount,
        units: p.units,
        wmsTms: p.wmsTms,
        ups: p.ups,
        pros: p.pros,
        flags: p.flags,
        shipments,
        cartons: p.cartons.slice(0, MAX_CARTONS).map((c) => ({
          label: c.label,
          order: c.orderNum,
          tracking: [c.trackingNumber, c.secondTrack].filter(Boolean).join(" / ") || null,
          product: c.product,
          quantity: c.quantity,
          shippedAt: c.shippedAt.toISOString(),
          shipTo: [c.shipCity, c.shipState, c.shipZip].filter(Boolean).join(", "),
        })),
        parcels: p.parcels.map((x) => ({
          number: x.trackingNumber,
          status: x.status,
          delivered: x.delivered,
          deliveredAt: iso(x.deliveredAt),
          expectedAt: iso(x.expectedAt),
          lastActivity: x.lastActivity,
          lastLocation: x.lastLocation,
          checkedAt: iso(x.checkedAt),
        })),
        notes: notes
          .filter((n) => n.poNumber === p.poNumber || (n.shipmentNumber && shipments.some((s) => s.number === n.shipmentNumber)))
          .slice(0, 10)
          .map((n) => ({ body: n.body, author: n.author?.name ?? "Former user", at: n.createdAt.toISOString(), shipment: n.shipmentNumber })),
        emails: emails
          .filter((e) => e.poNumbers.includes(p.poNumber) || e.shipmentNumbers.some((n) => shipments.some((s) => s.number === n)))
          .slice(0, 10)
          .map((e) => ({ id: e.id, at: e.createdAt.toISOString(), sender: e.senderName, to: recipientsSummary(e), subject: e.subject, requests: e.requests, sent: e.sent })),
      },
    };
  }
  return out;
}

export interface ReviewIssue {
  id: string;
  label: string;
  title: string;
  date: string;
  status: string;
  statusVariant: "destructive" | "warning" | "success" | "secondary";
  category: string;
  severity: string;
  team: string | null;
  estimatedFine: number | null;
  tickets: string[];
  poCount: number;
  description: string;
  resolution: string | null;
}

/** The Issue Log issues on each line's PO record (reused PO numbers matched as everywhere else), with their details */
export async function reviewIssues(recordIds: string[]): Promise<Map<string, ReviewIssue[]>> {
  const byRecord = await issuesForPoRecords(recordIds);
  const ids = [...new Set([...byRecord.values()].flatMap((list) => list.map((i) => i.id)))];
  if (!ids.length) return new Map();
  const [details, names] = await Promise.all([
    prisma.issue.findMany({
      where: { id: { in: ids } },
      select: { id: true, number: true, title: true, issueDate: true, status: true, category: true, severity: true, team: true, estimatedFine: true, hdTickets: true, description: true, resolution: true, _count: { select: { pos: true } } },
    }),
    teamNames(),
  ]);
  const byId = new Map(details.map((d) => [d.id, d]));
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
  return new Map(
    [...byRecord.entries()].map(([recordId, list]) => [
      recordId,
      list.flatMap((i) => {
        const d = byId.get(i.id);
        if (!d) return [];
        return [
          {
            id: d.id,
            label: issueLabel(d.number),
            title: d.title,
            date: d.issueDate.toISOString(),
            status: ISSUE_STATUSES[d.status].label,
            statusVariant: ISSUE_STATUSES[d.status].variant,
            category: d.category,
            severity: ISSUE_SEVERITIES[d.severity],
            team: d.team ? (names[d.team] ?? d.team) : null,
            estimatedFine: d.estimatedFine,
            tickets: d.hdTickets,
            poCount: d._count.pos,
            description: clip(d.description, 400),
            resolution: d.resolution ? clip(d.resolution, 300) : null,
          },
        ];
      }),
    ]),
  );
}
