import { FLAGS, type Flag, type FlagCode, type PoView, type ShipmentView } from "@/lib/logistics/views";

// Logistics › Send to EDI team: the issue types an email can ask for, the one-line summary of each
// PO or shipment, and the draft email built from them. Pure (unit-tested) and safe in the browser.

export type SelectionKind = "po" | "shipment";
export const MAX_SELECTION = 200;

export interface EdiIssueType {
  key: string;
  label: string;
  /** What the email asks the EDI team to do */
  request: string;
  /** Flags that suggest this type (pre-ticked when the selection has them) */
  flags: FlagCode[];
}

export const EDI_ISSUE_TYPES: EdiIssueType[] = [
  { key: "tms-id", label: "Correct the TMS shipment ID", request: "Correct the TMS shipment ID on the ASN and labels so it matches the shipment THD has the PO on.", flags: ["SUSPECT_TMS_ID", "TMS_ID_MISMATCH", "TMS_ID_NOT_FOUND"] },
  { key: "asn", label: "Send or resend the ASN", request: "Send (or resend) the ASN for these POs.", flags: ["NO_TMS_SHIPMENT"] },
  { key: "ship-to", label: "Correct the ship-to address", request: "Correct the ship-to address for these POs.", flags: ["WRONG_DESTINATION", "CITY_SPELLING"] },
  { key: "planex", label: "Confirm the destination in Vendor PlanEx", request: "These go to a THD crossdock: confirm the destination in Vendor PlanEx and that the ASN matches it.", flags: ["CHECK_PLANEX"] },
  { key: "cancel", label: "Cancel or close the PO", request: "Cancel or close these POs: THD shows them canceled.", flags: ["CANCELED_SHIPPED"] },
  { key: "status", label: "Check the shipment status in TMS", request: "Check and update the shipment status in TMS (pickup or delivery dates have passed).", flags: ["PICKUP_PASSED", "DELIVERY_OVERDUE", "NO_CARRIER"] },
  { key: "other", label: "Other (described below)", request: "See the note below.", flags: [] },
];

const flagLabels = (flags: Flag[]) => [...new Set(flags.filter((f) => f.severity !== "info").map((f) => FLAGS[f.code].label))];

/** One line per PO for the email and the dialog */
export function poLine(p: PoView): string {
  const shipments = p.shipments.map((s) => `TMS ${s.shipmentNumber}${s.scac ? ` (${s.scac})` : ""}`);
  const wmsIds = p.wmsTms.filter((id) => !p.shipments.some((s) => s.shipmentNumber === id));
  const flags = flagLabels(p.flags);
  return [
    `PO ${p.poNumber}`,
    p.destination !== "—" ? `to ${p.destination}` : null,
    shipments.length ? shipments.join(", ") : p.ups.length ? `UPS ${p.ups.slice(0, 2).join(", ")}${p.ups.length > 2 ? "…" : ""}` : "no TMS shipment",
    wmsIds.length ? `WMS has TMS ID ${wmsIds.join(", ")}` : null,
    flags.length ? `flags: ${flags.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** One line per shipment for the email and the dialog */
export function shipmentLine(s: ShipmentView): string {
  const flags = flagLabels(s.flags);
  return [
    `Shipment ${s.shipmentNumber}`,
    s.scac ?? "no carrier",
    s.status,
    [s.destFacility, [s.destCity, s.destState].filter(Boolean).join(", ")].filter(Boolean).join(" ") || null,
    s.ourPos.length ? `PO${s.ourPos.length > 1 ? "s" : ""} ${s.ourPos.join(", ")}` : null,
    flags.length ? `flags: ${flags.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Issue types the selection's flags point to */
export function suggestedTypes(flagCodes: string[]): string[] {
  return EDI_ISSUE_TYPES.filter((t) => t.flags.some((f) => flagCodes.includes(f))).map((t) => t.key);
}

/** The email as first drafted; people edit it before sending */
export function ediDraft({ kind, lines, poNumbers, types, sender, fileName }: { kind: SelectionKind; lines: string[]; poNumbers: string[]; types: string[]; sender: string; fileName: string }) {
  const chosen = EDI_ISSUE_TYPES.filter((t) => types.includes(t.key));
  const noun = kind === "po" ? (lines.length === 1 ? "PO" : "POs") : lines.length === 1 ? "shipment" : "shipments";
  const subject = `Action needed: ${lines.length} ${noun}${chosen.length ? ` (${chosen.filter((t) => t.key !== "other").map((t) => t.label).join("; ") || "see note"})` : ""}`;
  const body = [
    "Hi EDI team,",
    "",
    `Please take action on the ${lines.length} ${noun} below.`,
    "",
    ...(chosen.length ? ["What's needed:", ...chosen.map((t) => `- ${t.request}`), ""] : []),
    `${kind === "po" ? "POs" : "Shipments"}:`,
    ...lines.map((l) => `- ${l}`),
    "",
    ...(kind === "shipment" && poNumbers.length ? [`PO numbers: ${poNumbers.join(", ")}`, ""] : []),
    `The attached report (${fileName}) has the details for each one.`,
    "",
    "Thanks,",
    sender,
  ].join("\n");
  return { subject: subject.slice(0, 250), body };
}

/** Email addresses typed with commas, semicolons or spaces; null when one isn't an address */
export function parseAddresses(text: string): string[] | null {
  const list = text
    .split(/[\s,;]+/)
    .map((a) => a.trim())
    .filter(Boolean);
  return list.every((a) => /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(a)) ? [...new Set(list)] : null;
}

/** Plain text (the edited message) as simple email HTML: escaped, line breaks kept */
export function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  return `<!doctype html><html><body style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827"><div style="white-space:pre-wrap">${esc(text)}</div></body></html>`;
}
